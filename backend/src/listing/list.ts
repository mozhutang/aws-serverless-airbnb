import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EXPERIENCE_TABLE = process.env.EXPERIENCE_TABLE_NAME || '';
const STAY_TABLE = process.env.STAY_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { type, lastEvaluatedKey } = event.queryStringParameters || {};

    if (!type || (type !== 'STAY' && type !== 'EXPR')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid or missing type' }),
        };
    }

    const tableName = type === 'EXPR' ? EXPERIENCE_TABLE : STAY_TABLE;

    const params: ScanCommandInput = {
        TableName: tableName,
        ProjectionExpression: 'listingId, city, image',
        Limit: 20,
    };

    if (lastEvaluatedKey) {
        params.ExclusiveStartKey = { listingId: lastEvaluatedKey };
    }

    try {
        const result = await docClient.send(new ScanCommand(params));

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
