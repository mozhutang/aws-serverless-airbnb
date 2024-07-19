import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const ORDER_TABLE = process.env.ORDER_TABLE_NAME || '';
const LISTING_TABLE = process.env.LISTING_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { listingId } = event.pathParameters || {};

    if (!token || !listingId) {
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

        // Get the listing details to fetch the hostId
        const listingResult = await docClient.send(new GetCommand({
            TableName: LISTING_TABLE,
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

        if (userIdFromToken !== hostId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'User is not authorized to view orders for this listing' }),
            };
        }

        // Query the orders by listingId
        const queryParams = {
            TableName: ORDER_TABLE,
            IndexName: 'ListingIdIndex',
            KeyConditionExpression: 'listingId = :listingId',
            ExpressionAttributeValues: {
                ':listingId': listingId,
            },
        };

        const result = await docClient.send(new QueryCommand(queryParams));

        return {
            statusCode: 200,
            body: JSON.stringify(result.Items),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch orders', error: error.message }),
        };
    }
};
