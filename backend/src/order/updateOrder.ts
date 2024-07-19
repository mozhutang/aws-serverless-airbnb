import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const ORDER_TABLE = process.env.ORDER_TABLE_NAME || '';
const AVAILABILITY_TABLE = process.env.AVAILABILITY_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { orderId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { userId, listingId, startDate, endDate } = body;

    if (!token || !orderId || !userId || !listingId || !startDate || !endDate) {
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
                body: JSON.stringify({ message: 'User is not authorized to update order' }),
            };
        }

        // Get the old order details
        const getOrderResult = await docClient.send(new GetCommand({
            TableName: ORDER_TABLE,
            Key: { orderId },
        }));

        const oldOrder = getOrderResult.Item;

        if (!oldOrder) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Order not found' }),
            };
        }

        const { listingId: oldListingId, startDate: oldStartDate, endDate: oldEndDate } = oldOrder;

        // Calculate the range of dates in the new order
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const newDateRange = [];
        let currentDate = new Date(startDate);
        const newEndDate = new Date(endDate);
        while (currentDate <= newEndDate) {
            newDateRange.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Calculate the range of dates in the old order
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const oldDateRange = [];
        currentDate = new Date(oldStartDate);
        const oldEndDateObj = new Date(oldEndDate);
        while (currentDate <= oldEndDateObj) {
            oldDateRange.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Find dates that are in the new order but not in the old order
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const newOnlyDates = newDateRange.filter(date => !oldDateRange.includes(date));

        if (newOnlyDates.length > 0) {
            // Query the AvailabilityTable to check if the new only dates are available
            for (const date of newOnlyDates) {
                const queryParams = {
                    TableName: AVAILABILITY_TABLE,
                    Key: { listingId, date },
                };

                const availabilityResult = await docClient.send(new GetCommand(queryParams));
                const availableDate = availabilityResult.Item;

                if (!availableDate || !availableDate.isAvailable) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ message: 'Some of the new dates are not available' }),
                    };
                }
            }
        }

        // Calculate the total amount for the new dates
        let totalAmount = 0;
        for (const date of newDateRange) {
            const queryParams = {
                TableName: AVAILABILITY_TABLE,
                Key: { listingId, date },
            };

            const availabilityResult = await docClient.send(new GetCommand(queryParams));
            const availableDate = availabilityResult.Item;

            if (availableDate) {
                totalAmount += availableDate.price;
            }
        }

        // Create the new order
        const newOrder = {
            ...oldOrder,
            listingId,
            startDate,
            endDate,
            totalAmount,
            updatedAt: new Date().toISOString(),
        };

        await docClient.send(new PutCommand({
            TableName: ORDER_TABLE,
            Item: newOrder,
        }));

        // Update the availability to set isAvailable to false for the new dates
        for (const date of newDateRange) {
            const updateParams = {
                TableName: AVAILABILITY_TABLE,
                Key: { listingId, date },
                UpdateExpression: 'SET isAvailable = :isAvailable',
                ExpressionAttributeValues: {
                    ':isAvailable': false,
                },
            };
            await docClient.send(new UpdateCommand(updateParams));
        }

        // Restore the availability of the old order dates that are not in the new order
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        for (const date of oldDateRange.filter(date => !newDateRange.includes(date))) {
            const updateParams = {
                TableName: AVAILABILITY_TABLE,
                Key: { listingId: oldListingId, date },
                UpdateExpression: 'SET isAvailable = :isAvailable',
                ExpressionAttributeValues: {
                    ':isAvailable': true,
                },
            };
            await docClient.send(new UpdateCommand(updateParams));
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Order updated successfully', orderId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not update order', error: error.message }),
        };
    }
};
