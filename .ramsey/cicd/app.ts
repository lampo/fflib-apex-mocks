import rs from "rs-cdk";
import hub, { cicd } from "rs-cdk/accounts/hub";
import * as codebuild from "@aws-cdk/aws-codebuild";
import * as iam from "@aws-cdk/aws-iam";

const app = new rs.core.App({
  billing: rs.core.BillingTags.GLOBAL,
  name: "salesforce-apex-mocks",
});

const stack = new rs.core.Stack(app, `${app.repo.name}-cicd`, {
  env: hub.cicd,
});

// this will eventually move
const role = new iam.Role(stack, "BuildRole", {
  assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
});

role.addToPolicy(
  new iam.PolicyStatement({
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "codebuild:CreateReportGroup",
      "codebuild:CreateReport",
      "codebuild:UpdateReport",
      "codebuild:BatchPutTestCases",
    ],
    resources: ["*"],
  })
);

role.addToPolicy(
  new iam.PolicyStatement({
    actions: ["ssm:GetParameter*", "secretsmanager:GetSecretValue"],
    resources: [
      `arn:aws:ssm:${stack.region}:${hub.cicd.account}:parameter/salesforce/*`,
      `arn:aws:secretsmanager:us-east-1:058238361356:secret:codebuild/docker-hub-credentials-xZIbrm`,
    ],
  })
);

new rs.cicd.PRBuild(stack, "PRBuild", {
  repo: app.repo,
  role,
  buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
  privileged: true
});


/**
 * Everything below this would eventually live separately from this project
 * it is only hear while I test it
 */
const cicdRole = new iam.Role(stack, `${app.repo.name}Role`, {
    assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
    roleName: `${app.repo.name}-cicd`
});

// Allow Codebuild things
cicdRole.addToPolicy(new iam.PolicyStatement({
    actions: [
        'codebuild:CreateProject',
        'codebuild:CreateWebhook',
        'codebuild:DeleteWebhook',
        'codebuild:UpdateProject',
        'codebuild:UpdateWebhook',
        'codebuild:DeleteProject',
    ],
    resources: [
        `arn:aws:codebuild:${stack.region}:${stack.account}:project/build-${app.repo.name}--*`,
        `arn:aws:codebuild:${stack.region}:${stack.account}:project/pr-${app.repo.name}--*`
    ]
}));

// Allow create build roles for codebuild
cicdRole.addToPolicy(new iam.PolicyStatement({
    actions: [
        'iam:CreateRole',
        'iam:DeleteRole',
    ],
    resources: [
        `arn:aws:iam::${stack.account}:role/build-${app.repo.name}--*`,
        `arn:aws:iam::${stack.account}:role/pr-${app.repo.name}--*`
    ]
}));

const cicdDeploymentRole = new iam.Role(stack, `${app.repo.name}CicdDeploymentRole`, {
    assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    roleName: `${app.repo.name}--cicd-deployment`
});

cicdDeploymentRole.addToPolicy(new iam.PolicyStatement({
    actions: [
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack'
    ],
    resources: [
        `arn:aws:cloudformation:${stack.region}:${stack.account}:stack/${app.repo.name}--cicd`,
    ]
}));
cicdRole.grantPassRole(cicdDeploymentRole);

new codebuild.Project(stack, `${app.repo.name}CicdDeployment`, {
    projectName: `${app.repo.name}-cicd`,
    role: cicdDeploymentRole,
    source: app.repo.createCodeBuildSource({
        webhookFilters: [
            codebuild.FilterGroup
                .inEventOf(codebuild.EventAction.PUSH)
                .andBranchIs('cicd')
                .andFilePathIs('.ramsey/cicd/*')
        ]
    }),
    buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
            build: {
                commands: [
                    'cd .ramsey/cicd',
                    'yarn',
                    'npx cdk synth'
                ]
            }
        }
    }),
    environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
        privileged: false
    }
});
