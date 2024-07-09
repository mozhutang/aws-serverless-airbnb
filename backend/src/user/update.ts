import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE_NAME || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { userId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { profile, personalInformation } = body;

    if (!token || !userId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing token or userId' }),
        };
    }

    try {
        // Fetch user from Cognito to validate the token
        const getUserCommand = new GetUserCommand({ AccessToken: token });
        const userResponse = await cognitoClient.send(getUserCommand);

        const tokenUserId = userResponse.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;

        // Ensure the userId from the path matches the userId from the token
        if (tokenUserId !== userId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Forbidden: userId does not match token' }),
            };
        }

        // Build UpdateExpression
        let updateExpression = 'SET';
        const expressionAttributeNames: { [key: string]: string } = {};
        const expressionAttributeValues: { [key: string]: any } = {};

        if (profile) {
            for (const key in profile) {
                updateExpression += ` #profile.${key} = :profile_${key},`;
                expressionAttributeNames[`#profile.${key}`] = `profile.${key}`;
                expressionAttributeValues[`:profile_${key}`] = profile[key];
            }
        }

        if (personalInformation) {
            for (const key in personalInformation) {
                updateExpression += ` #personalInformation.${key} = :personalInformation_${key},`;
                expressionAttributeNames[`#personalInformation.${key}`] = `personalInformation.${key}`;
                expressionAttributeValues[`:personalInformation_${key}`] = personalInformation[key];
            }
        }

        // Remove trailing comma
        updateExpression = updateExpression.slice(0, -1);

        const updateParams: UpdateCommandInput = {
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'UPDATED_NEW',
        };

        await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'User updated successfully' }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not update user', error: error.message }),
        };
    }
};
