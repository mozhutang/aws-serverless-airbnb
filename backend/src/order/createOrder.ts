import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const ORDER_TABLE = process.env.ORDER_TABLE_NAME || '';
const AVAILABILITY_TABLE = process.env.AVAILABILITY_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const body = JSON.parse(event.body || '{}');
    const { userId, listingId, startDate, endDate } = body;

    if (!token || !userId || !listingId || !startDate || !endDate) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required fields' }),
        };
    }

    try {
        // Verify token by calling Cognito
        const getUserCommand = new GetUserCommand({ AccessToken: token });
        const userResponse = await cognitoClient.send(getUserCommand);

        if (!userResponse.UserAttributes) {
            throw new Error('User attributes not found');
        }

        const userIdFromToken = userResponse.UserAttributes.find(attr => attr.Name === 'sub')?.Value;

        if (userIdFromToken !== userId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'User is not authorized to create order' }),
            };
        }

        // Get the listing details to fetch the hostId
        const listingResult = await docClient.send(new GetCommand({
            TableName: process.env.LISTING_TABLE_NAME || '',
            Key: { listingId },
        }));

        const listing = listingResult.Item;
        if (!listing) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Listing not found' }),
            };
        }

        const hostId = listing.hostId;

        // Check availability for the given date range
        let totalAmount = 0;
        for (let currentDate = new Date(startDate); currentDate <= new Date(endDate); currentDate.setDate(currentDate.getDate() + 1)) {
            const dateString = currentDate.toISOString().split('T')[0];
            const availabilityResult = await docClient.send(new GetCommand({
                TableName: AVAILABILITY_TABLE,
                Key: { listingId, date: dateString },
            }));

            const availability = availabilityResult.Item;
            if (!availability || !availability.isAvailable) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Listing is not available for the selected date range' }),
                };
            }

            totalAmount += availability.price;
        }

        // Create the order
        const orderId = uuidv4();
        const newOrder = {
            orderId,
            userId,
            listingId,
            hostId,
            startDate,
            endDate,
            totalAmount,
            createdAt: new Date().toISOString(),
        };

        await docClient.send(new PutCommand({
            TableName: ORDER_TABLE,
            Item: newOrder,
        }));

        // Update the availability to set isAvailable to false for the new dates
        for (let currentDate = new Date(startDate); currentDate <= new Date(endDate); currentDate.setDate(currentDate.getDate() + 1)) {
            const dateString = currentDate.toISOString().split('T')[0];
            await docClient.send(new PutCommand({
                TableName: AVAILABILITY_TABLE,
                Item: { listingId, date: dateString, isAvailable: false },
            }));
        }

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'Order created successfully', orderId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not create order', error: error.message }),
        };
    }
};
