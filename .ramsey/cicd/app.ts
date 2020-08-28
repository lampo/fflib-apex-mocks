import rs from "rs-cdk";
import hub from 'rs-cdk/accounts/hub';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as secrets from '@aws-cdk/aws-secretsmanager';

const app = new rs.core.App({
    billing: rs.core.BillingTags.GLOBAL,
    name: 'salesforce-apex-mocks'
});

const stack = new rs.core.Stack(app, `${app.repo.name}-cicd`, {
  env: hub.cicd
});

// this will eventually move
const role = new iam.Role(stack, 'BuildRole', {
    assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
});

role.addToPolicy(new iam.PolicyStatement({
    actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "codebuild:CreateReportGroup",
        "codebuild:CreateReport",
        "codebuild:UpdateReport",
        "codebuild:BatchPutTestCases"
    ],
    resources: ['*']
}));


role.addToPolicy(new iam.PolicyStatement({
    actions: [
        "ssm:GetParameter*"
    ],
    resources: [
        `arn:aws:ssm:us-east-1:${hub.cicd.account}:parameter/salesforce/*`
    ]
}))

new rs.cicd.PRBuild(stack, "PRBuild", {
    repo: app.repo,
    role,
    buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('appirio/dx:3.0.1.191186', {
        secretsManagerCredentials: secrets.Secret.fromSecretArn(stack, `DockerCredentials`, 'arn:aws:secretsmanager:us-east-1:058238361356:secret:codebuild/docker-hub-credentials-xZIbrm')
    })
});
