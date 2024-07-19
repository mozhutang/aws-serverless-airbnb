import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface OrderStackProps extends cdk.StackProps {
    userPoolId: string;
    hostGroup: string;
    availabilityTable: dynamodb.Table;
    listingTable: dynamodb.Table;
}

export class OrderStack extends cdk.Stack {
    public readonly orderTable: dynamodb.Table;

    constructor(scope: Construct, id: string, props: OrderStackProps) {
        super(scope, id, props);

        const { userPoolId, availabilityTable,listingTable } = props;

        // Create DynamoDB table for orders
        this.orderTable = new dynamodb.Table(this, 'OrderTable', {
            partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Add a GSI for userId to query orders by user, projecting only orderId
        this.orderTable.addGlobalSecondaryIndex({
            indexName: 'UserIdIndex',
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.KEYS_ONLY,
        });

        // Add a GSI for listingId to query orders by listing, projecting only orderId
        this.orderTable.addGlobalSecondaryIndex({
            indexName: 'ListingIdIndex',
            partitionKey: { name: 'listingId', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.KEYS_ONLY,
        });

        // Create Lambda functions for order operations
        const createOrderFunction = new lambda.Function(this, 'CreateOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/createOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                AVAILABILITY_TABLE_NAME: availabilityTable.tableName,
                USER_POOL_ID: userPoolId,
                LISTING_TABLE_NAME: listingTable.tableName
            },
        });

        const updateOrderFunction = new lambda.Function(this, 'UpdateOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/updateOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                AVAILABILITY_TABLE_NAME: availabilityTable.tableName,
                USER_POOL_ID: userPoolId,
            },
        });

        const getOrderFunction = new lambda.Function(this, 'GetOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/getOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                USER_POOL_ID: userPoolId,
            },
        });

        const getByUserFunction = new lambda.Function(this, 'GetByUserFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/getByUser.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                USER_POOL_ID: userPoolId,
            },
        });

        const getByListingFunction = new lambda.Function(this, 'GetByListingFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/getByListing.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                LISTING_TABLE_NAME: listingTable.tableName,
                USER_POOL_ID: userPoolId,
            },
        });

        const deleteOrderFunction = new lambda.Function(this, 'DeleteOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/deleteOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                AVAILABILITY_TABLE_NAME: availabilityTable.tableName,
                USER_POOL_ID: userPoolId,
            },
        });

        this.orderTable.grantReadWriteData(createOrderFunction);
        availabilityTable.grantReadWriteData(createOrderFunction);
        listingTable.grantReadData(createOrderFunction);
        this.orderTable.grantReadWriteData(updateOrderFunction);
        availabilityTable.grantReadWriteData(updateOrderFunction);
        this.orderTable.grantReadData(getOrderFunction);
        this.orderTable.grantReadData(getByUserFunction);
        this.orderTable.grantReadData(getByListingFunction);
        listingTable.grantReadData(getByListingFunction);
        this.orderTable.grantReadWriteData(deleteOrderFunction);
        availabilityTable.grantReadWriteData(deleteOrderFunction);


        // Create API Gateway
        const api = new apigateway.RestApi(this, 'OrderApi', {
            restApiName: 'Order Service',
        });

        const orders = api.root.addResource('orders');
        const createOrder = orders.addResource('create');
        createOrder.addMethod('POST', new apigateway.LambdaIntegration(createOrderFunction));

        const updateOrder = orders.addResource('update').addResource('{orderId}');
        updateOrder.addMethod('PUT', new apigateway.LambdaIntegration(updateOrderFunction));

        const getOrder = orders.addResource('get').addResource('{orderId}');
        getOrder.addMethod('GET', new apigateway.LambdaIntegration(getOrderFunction));

        const getByUser = orders.addResource('getByUser').addResource('{userId}');
        getByUser.addMethod('GET', new apigateway.LambdaIntegration(getByUserFunction));

        const getByListing = orders.addResource('getByListing').addResource('{listingId}');
        getByListing.addMethod('GET', new apigateway.LambdaIntegration(getByListingFunction));

        const deleteOrder = orders.addResource('delete').addResource('{orderId}');
        deleteOrder.addMethod('DELETE', new apigateway.LambdaIntegration(deleteOrderFunction));
    }
}
