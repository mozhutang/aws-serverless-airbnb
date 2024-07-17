import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const LISTING_TABLE_NAME = process.env.LISTING_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { listingId } = event.pathParameters || {};

    if (!listingId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing listingId' }),
        };
    }

    const prefix = listingId.split('#')[0];

    if (prefix !== 'EXPR' && prefix !== 'STAY')  {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid listingId prefix' }),
        };
    }

    try {
        const result = await docClient.send(new GetCommand({
            TableName: LISTING_TABLE_NAME,
            Key: { listingId },
        }));

        const listing = result.Item;

        if (!listing) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Listing not found' }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(listing),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch listing', error: error.message }),
        };
    }
};

