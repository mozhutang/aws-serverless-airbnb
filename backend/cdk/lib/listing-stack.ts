import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface ListingStackProps extends cdk.StackProps {
    userPoolId: string;
    userPoolClientId: string;
    hostGroup: string;
}

export class ListingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ListingStackProps) {
        super(scope, id, props);

        // Create DynamoDB tables
        const experienceTable = new dynamodb.Table(this, 'ExperienceTable', {
            partitionKey: { name: 'listingId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const stayTable = new dynamodb.Table(this, 'StayTable', {
            partitionKey: { name: 'listingId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create Lambda function for creating listing
        const createListingFunction = new lambda.Function(this, 'CreateListingFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'listing/create.handler',
            code: lambda.Code.fromAsset('src/listing'),
            environment: {
                EXPERIENCE_TABLE_NAME: experienceTable.tableName,
                STAY_TABLE_NAME: stayTable.tableName,
                USER_POOL_ID: props.userPoolId,
                HOST_GROUP: props.hostGroup,
            },
        });

        experienceTable.grantReadWriteData(createListingFunction);
        stayTable.grantReadWriteData(createListingFunction);

        createListingFunction.addToRolePolicy(new PolicyStatement({
            actions: [
                'cognito-idp:GetUser',
                'cognito-idp:AdminAddUserToGroup'
            ],
            resources: [`arn:aws:cognito-idp:*:*:userpool/${props.userPoolId}`],
        }));

        // Create Lambda function for getting listing
        const getListingFunction = new lambda.Function(this, 'GetListingFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'listing/get.handler',
            code: lambda.Code.fromAsset('src/listing'),
            environment: {
                EXPERIENCE_TABLE_NAME: experienceTable.tableName,
                STAY_TABLE_NAME: stayTable.tableName,
            },
        });

        experienceTable.grantReadData(getListingFunction);
        stayTable.grantReadData(getListingFunction);

        // Create Lambda function for listing listings
        const listListingsFunction = new lambda.Function(this, 'ListListingsFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'listing/list.handler',
            code: lambda.Code.fromAsset('src/listing'),
            environment: {
                EXPERIENCE_TABLE_NAME: experienceTable.tableName,
                STAY_TABLE_NAME: stayTable.tableName,
            },
        });

        experienceTable.grantReadData(listListingsFunction);
        stayTable.grantReadData(listListingsFunction);

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'ListingApi', {
            restApiName: 'Listing Service',
        });

        const listings = api.root.addResource('listings');
        const createListing = listings.addResource('create');
        const createListingIntegration = new apigateway.LambdaIntegration(createListingFunction);
        createListing.addMethod('POST', createListingIntegration);

        const getListing = listings.addResource('get').addResource('{listingId}');
        const getListingIntegration = new apigateway.LambdaIntegration(getListingFunction);
        getListing.addMethod('GET', getListingIntegration);

        const listListings = listings.addResource('list');
        const listListingsIntegration = new apigateway.LambdaIntegration(listListingsFunction);
        listListings.addMethod('GET', listListingsIntegration);

        // Output the table names
        new cdk.CfnOutput(this, 'ExperienceTableName', { value: experienceTable.tableName });
        new cdk.CfnOutput(this, 'StayTableName', { value: stayTable.tableName });
    }
}
