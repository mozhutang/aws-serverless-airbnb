import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface OrderStackProps extends cdk.StackProps {
    userPoolId: string;
    hostGroup: string;
}

export class OrderStack extends cdk.Stack {
    public readonly orderTable: dynamodb.Table;

    constructor(scope: Construct, id: string, props: OrderStackProps) {
        super(scope, id, props);

        const { userPoolId, hostGroup } = props;

        // Create DynamoDB table for orders
        this.orderTable = new dynamodb.Table(this, 'OrderTable', {
            partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Add a GSI for userId to query orders by user
        this.orderTable.addGlobalSecondaryIndex({
            indexName: 'UserIdIndex',
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // Create Lambda functions for order operations
        const createOrderFunction = new lambda.Function(this, 'CreateOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/createOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                USER_POOL_ID: userPoolId,
                HOST_GROUP: hostGroup,
            },
        });

        const updateOrderFunction = new lambda.Function(this, 'UpdateOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/updateOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                USER_POOL_ID: userPoolId,
                HOST_GROUP: hostGroup,
            },
        });

        const getOrderFunction = new lambda.Function(this, 'GetOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/getOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
            },
        });

        const deleteOrderFunction = new lambda.Function(this, 'DeleteOrderFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'order/deleteOrder.handler',
            code: lambda.Code.fromAsset('src/order'),
            environment: {
                ORDER_TABLE_NAME: this.orderTable.tableName,
                USER_POOL_ID: userPoolId,
                HOST_GROUP: hostGroup,
            },
        });

        this.orderTable.grantReadWriteData(createOrderFunction);
        this.orderTable.grantReadWriteData(updateOrderFunction);
        this.orderTable.grantReadData(getOrderFunction);
        this.orderTable.grantReadWriteData(deleteOrderFunction);

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

        const deleteOrder = orders.addResource('delete').addResource('{orderId}');
        deleteOrder.addMethod('DELETE', new apigateway.LambdaIntegration(deleteOrderFunction));
    }
}
