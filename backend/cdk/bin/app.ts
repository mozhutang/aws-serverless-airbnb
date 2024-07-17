import { App, Stack, StackProps } from 'aws-cdk-lib';
import { UserStack } from '../lib/user-stack';
import { ListingStack } from '../lib/listing-stack';
import { OrderStack } from '../lib/order-stack';


class MainStack extends Stack {
    constructor(scope: App, id: string, props?: StackProps) {
        super(scope, id, props);

        const userStack = new UserStack(this, 'UserStack');

        new ListingStack(this, 'ListingStack', {
            userPoolId: userStack.userPoolId,
            userPoolClientId: userStack.userPoolClientId,
            hostGroup: userStack.hostGroup,
        });

        new OrderStack(this, 'OrderStack', {
            userPoolId: userStack.userPoolId,
            hostGroup: userStack.hostGroup,
        });
    }
}

const app = new App();
new MainStack(app, 'MainStack');
app.synth();
