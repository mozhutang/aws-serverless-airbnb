import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EXPERIENCE_TABLE = process.env.EXPERIENCE_TABLE_NAME || '';
const STAY_TABLE = process.env.STAY_TABLE_NAME || '';
const AVAILABILITY_TABLE = process.env.AVAILABILITY_TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const HOST_GROUP = process.env.HOST_GROUP || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { listingId } = event.pathParameters || {};

    if (!token || !listingId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required fields' }),
        };
    }

    let userId: string | undefined;
    let userGroups: string[] = [];

    try {
        // Verify token by calling Cognito
        const getUserCommand = new GetUserCommand({ AccessToken: token });
        const userResponse = await cognitoClient.send(getUserCommand);

        if (!userResponse.UserAttributes) {
            throw new Error('User attributes not found');
        }

        userId = userResponse.UserAttributes.find(attr => attr.Name === 'sub')?.Value;

        if (!userId) {
            throw new Error('User ID not found in token');
        }

        // Check user groups
        const groupsAttribute = userResponse.UserAttributes.find(attr => attr.Name === 'cognito:groups');
        if (groupsAttribute && groupsAttribute.Value) {
            userGroups = groupsAttribute.Value.split(',');
        }

        // Check if user is in host group
        if (!userGroups.includes(HOST_GROUP)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'User is not authorized to delete listing' }),
            };
        }
    } catch (error) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Invalid token', error: error.message }),
        };
    }

    // Verify listing existence and ownership
    const tableName = listingId.startsWith('EXPR') ? EXPERIENCE_TABLE : STAY_TABLE;

    try {
        const listingResult = await docClient.send(new GetCommand({
            TableName: tableName,
            Key: { listingId },
        }));

        const listing = listingResult.Item;

        if (!listing) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Listing not found' }),
            };
        }

        if (listing.hostId !== userId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'User does not own this listing' }),
            };
        }

        // Delete listing from listing table
        await docClient.send(new DeleteCommand({
            TableName: tableName,
            Key: { listingId },
        }));

        // Delete related availability entries
        const availabilityResult = await docClient.send(new QueryCommand({
            TableName: AVAILABILITY_TABLE,
            KeyConditionExpression: 'listingId = :listingId',
            ExpressionAttributeValues: {
                ':listingId': listingId,
            },
        }));

        for (const item of availabilityResult.Items || []) {
            await docClient.send(new DeleteCommand({
                TableName: AVAILABILITY_TABLE,
                Key: { listingId, date: item.date },
            }));
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Listing deleted successfully' }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not delete listing', error: error.message }),
        };
    }
};
