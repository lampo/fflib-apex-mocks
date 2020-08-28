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
        "ssm:GetParameter*",
        "secretsmanager:GetSecretValue"
    ],
    resources: [
        `arn:aws:ssm:us-east-1:${hub.cicd.account}:parameter/salesforce/*`,
        `arn:aws:secretsmanager:us-east-1:058238361356:secret:codebuild/docker-hub-credentials-xZIbrm`
    ]
}))

new rs.cicd.PRBuild(stack, "PRBuild", {
    repo: app.repo,
    role,
    buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
    privileged: true
});
