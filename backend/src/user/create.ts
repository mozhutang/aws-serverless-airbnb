import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const USERS_TABLE = process.env.USERS_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const userId = event.requestContext.identity.cognitoIdentityId;
    const body = JSON.parse(event.body || '{}');

    const params = {
        TableName: USERS_TABLE,
        Item: {
            userId: userId,
            ...body,
        },
    };

    try {
        await docClient.send(new PutCommand(params));
        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not create user', error: error.message }),
        };
    }
};
