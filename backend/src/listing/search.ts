import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const AVAILABILITY_TABLE = process.env.AVAILABILITY_TABLE_NAME || '';
const EXPERIENCE_TABLE = process.env.EXPERIENCE_TABLE_NAME || '';
const STAY_TABLE = process.env.STAY_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { startDate, endDate, type, minPrice, maxPrice, lastEvaluatedKey } = event.queryStringParameters || {};

    if (!type || (type !== 'STAY' && type !== 'EXPR')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid or missing type' }),
        };
    }

    if (!startDate || !endDate) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required query parameters: startDate and endDate' }),
        };
    }

    const tableName = type === 'EXPR' ? EXPERIENCE_TABLE : STAY_TABLE;

    // Step 1: Query the Availability table for listings available in the date range
    const availabilityParams = {
        TableName: AVAILABILITY_TABLE,
        KeyConditionExpression: '#listingId = :listingId AND #date BETWEEN :startDate AND :endDate',
        ExpressionAttributeNames: {
            '#listingId': 'listingId',
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':listingId': type,
            ':startDate': startDate,
            ':endDate': endDate,
            ':isAvailable': true,
        },
        FilterExpression: 'isAvailable = :isAvailable',
    };

    try {
        const availabilityResult = await docClient.send(new QueryCommand(availabilityParams));
        const availableListings = availabilityResult.Items?.map(item => item.listingId) || [];

        if (availableListings.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ items: [], lastEvaluatedKey: null }),
            };
        }

        // Step 2: Scan the Listings table to filter by price range and list only available listings
        const scanParams: ScanCommandInput = {
            TableName: tableName,
            ProjectionExpression: 'listingId, city, image',
            FilterExpression: 'listingId IN (:availableListings)',
            ExpressionAttributeValues: {
                ':availableListings': availableListings,
                ...(minPrice && { ':minPrice': Number(minPrice) }),
                ...(maxPrice && { ':maxPrice': Number(maxPrice) }),
            },
            Limit: 20,
        };

        if ((minPrice || maxPrice) && scanParams.ExpressionAttributeValues) {
            scanParams.FilterExpression += ' AND price BETWEEN :minPrice AND :maxPrice';
            scanParams.ExpressionAttributeValues[':minPrice'] = minPrice ? Number(minPrice) : 0;
            scanParams.ExpressionAttributeValues[':maxPrice'] = maxPrice ? Number(maxPrice) : Number.MAX_VALUE;
        }

        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = { listingId: lastEvaluatedKey };
        }

        const result = await docClient.send(new ScanCommand(scanParams));

        return {
            statusCode: 200,
            body: JSON.stringify({
                items: result.Items,
                lastEvaluatedKey: result.LastEvaluatedKey,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch listings', error: error.message }),
        };
    }
};
