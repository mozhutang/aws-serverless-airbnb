import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const LISTING_TABLE_NAME = process.env.LISTING_TABLE_NAME || '';
const HOST_GROUP = process.env.HOST_GROUP || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const body = JSON.parse(event.body || '{}');

    if (!token) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Missing authorization token' }),
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

        // If user is not in host group, add them
        if (!userGroups.includes(HOST_GROUP)) {
            const addUserToGroupCommand = new AdminAddUserToGroupCommand({
                GroupName: HOST_GROUP,
                UserPoolId: process.env.USER_POOL_ID || '',
                Username: userId,
            });
            await cognitoClient.send(addUserToGroupCommand);
        }
    } catch (error) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Invalid token', error: error.message }),
        };
    }

    const { listingType, ...rest } = body;
    const listingId = `${listingType === 'experience' ? 'EXPR' : 'STAY'}#${uuidv4()}`;
    const newListing = {
        ...rest,
        listingId,
        hostId: userId,
        listingType,
    };


    try {
        await docClient.send(new PutCommand({
            TableName: LISTING_TABLE_NAME,
            Item: newListing,
        }));

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'Listing created successfully', listingId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not create listing', error: error.message }),
        };
    }
};
