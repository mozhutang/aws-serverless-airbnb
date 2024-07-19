import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ORDER_TABLE = process.env.ORDER_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { orderId } = event.pathParameters || {};

    if (!orderId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required fields' }),
        };
    }

    try {
        const getOrderResult = await docClient.send(new GetCommand({
            TableName: ORDER_TABLE,
            Key: { orderId },
        }));

        const order = getOrderResult.Item;

        if (!order) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Order not found' }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ order }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch order', error: error.message }),
        };
    }
};
