import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const ORDER_TABLE = process.env.ORDER_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { orderId } = event.pathParameters || {};

    if (!token || !orderId) {
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

        // Get the order details
        const orderResult = await docClient.send(new GetCommand({
            TableName: ORDER_TABLE,
            Key: { orderId },
        }));

        const order = orderResult.Item;

        if (!order) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Order not found' }),
            };
        }

        const { userId, hostId } = order;

        // Check if the user is authorized to get the order
        if (userIdFromToken !== userId && userIdFromToken !== hostId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'User is not authorized to view this order' }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(order),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch order', error: error.message }),
        };
    }
};
