import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const AVAILABILITY_TABLE = process.env.AVAILABILITY_TABLE_NAME || '';
const EXPERIENCE_TABLE = process.env.EXPERIENCE_TABLE_NAME || '';
const STAY_TABLE = process.env.STAY_TABLE_NAME || '';


export const handler: APIGatewayProxyHandler = async (event) => {
    const { startDate, endDate, type, minPrice, maxPrice } = event.queryStringParameters || {};

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
    const listingPrefix = type === 'EXPR' ? 'EXPR#' : 'STAY#';

    // Step 1: Query the Availability table for listings available in the date range
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const availabilityParams: any = {
        TableName: AVAILABILITY_TABLE,
        IndexName: 'DatePriceIndex',
        KeyConditionExpression: '#date BETWEEN :startDate AND :endDate',
        FilterExpression: 'isAvailable = :isAvailable AND begins_with(#listingId, :listingPrefix)',
        ExpressionAttributeNames: {
            '#listingId': 'listingId',
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':startDate': startDate,
            ':endDate': endDate,
            ':isAvailable': true,
            ':listingPrefix': listingPrefix,
        },
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (minPrice || maxPrice) {
        availabilityParams.FilterExpression += ' AND price BETWEEN :minPrice AND :maxPrice';
        availabilityParams.ExpressionAttributeValues[':minPrice'] = minPrice ? Number(minPrice) : 0;
        availabilityParams.ExpressionAttributeValues[':maxPrice'] = maxPrice ? Number(maxPrice) : Number.MAX_VALUE;
    }

    try {
        const availabilityResult = await docClient.send(new QueryCommand(availabilityParams));
        const availableListings = availabilityResult.Items || [];

        if (availableListings.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ items: [], averagePrices: {} }),
            };
        }

        // Group listings by listingId and calculate average price for each listing
        const listingGroups: { [key: string]: { total: number, count: number } } = {};
        for (const item of availableListings) {
            const listingId = item.listingId;
            if (!listingGroups[listingId]) {
                listingGroups[listingId] = { total: 0, count: 0 };
            }
            listingGroups[listingId].total += item.price;
            listingGroups[listingId].count += 1;
        }

        const averagePrices: { [key: string]: number } = {};
        for (const listingId in listingGroups) {
            averagePrices[listingId] = listingGroups[listingId].total / listingGroups[listingId].count;
        }

        // Step 2: BatchGetItem to get the listings details
        const keys = Object.keys(listingGroups).map(listingId => ({ listingId }));

        const batchGetParams = {
            RequestItems: {
                [tableName]: {
                    Keys: keys,
                    ProjectionExpression: 'listingId, city, image',
                },
            },
        };

        const result = await docClient.send(new BatchGetCommand(batchGetParams));
        const items = result.Responses?.[tableName] || [];

        // Attach average prices to items
        const itemsWithPrices = items.map(item => ({
            ...item,
            averagePrice: averagePrices[item.listingId],
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({
                items: itemsWithPrices,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch listings', error: error.message }),
        };
    }
};
