import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, QueryCommand, BatchGetCommand, QueryCommandInput} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const LISTING_TABLE_NAME = process.env.LISTING_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { type, lastEvaluatedKey } = event.queryStringParameters || {};

    if (!type || (type !== 'experience' && type !== 'stay')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid or missing type' }),
        };
    }

    const params: QueryCommandInput = {
        TableName: LISTING_TABLE_NAME,
        IndexName: 'TypeIndex',
        KeyConditionExpression: '#listingType = :listingType',
        ExpressionAttributeNames: {
            '#listingType': 'listingType',
        },
        ExpressionAttributeValues: {
            ':listingType': type,
        },
        ProjectionExpression: 'listingId',
        Limit: 20,
    };

    if (lastEvaluatedKey) {
        params.ExclusiveStartKey = { listingId: lastEvaluatedKey };
    }

    try {
        const queryResult = await docClient.send(new QueryCommand(params));
        const listingIds = queryResult.Items?.map(item => item.listingId) || [];

        if (listingIds.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ items: [], lastEvaluatedKey: queryResult.LastEvaluatedKey }),
            };
        }

        // Fetch full details for each listing
        const keys = listingIds.map(listingId => ({ listingId }));
        const batchGetParams = {
            RequestItems: {
                [LISTING_TABLE_NAME]: {
                    Keys: keys,
                    ProjectionExpression: 'listingId, city, image',
                },
            },
        };

        const batchGetResult = await docClient.send(new BatchGetCommand(batchGetParams));
        const items = batchGetResult.Responses?.[LISTING_TABLE_NAME] || [];

        return {
            statusCode: 200,
            body: JSON.stringify({
                items,
                lastEvaluatedKey: queryResult.LastEvaluatedKey,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch listings', error: error.message }),
        };
    }
};
