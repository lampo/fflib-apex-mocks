import * as core from "rs-cdk/core";
import * as cdk from "@aws-cdk/core";
import * as codebuild from "@aws-cdk/aws-codebuild";
import * as iam from "@aws-cdk/aws-iam";

export interface TestProps extends cdk.StackProps {
  app: core.App;
}

export class Test extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: TestProps) {
    super(scope, id, props);
    new cdk.CfnParameter(this, `Owner`, {
      default: "lampo",
    });

    /**
     * Only allow lowercase, hypen-delimited strings.
     * We use a `--` as a delimeter after the app name to prevent name overlap
     * so this regex also prevents that.
     *
     * ^                Anchor at start of string
     * (?!-)            Assert that the first character isn't a -
     * (?!.*--)         Assert that there are no -- present anywhere
     * [A-Za-z0-9-]+    Match one or more allowed characters
     * (?<!-)           Assert that the last one isn't a -
     * $                Anchor at end of string
     */
    new cdk.CfnParameter(this, `AppName`, {
      allowedPattern: "^(?!-)(?!.*--)[a-z-]+(?<!-)$",
    });

    const appName = cdk.Fn.ref("AppName");
    const cicdResourceName = `${appName}--cicd`;
    const stackArn = `arn:aws:cloudformation:${this.region}:${this.account}:stack/${cicdResourceName}`;

    /**
     * The CICD Role is a Cloudformation Service Role
     * It is passed to the CICD Stack during create/update
     */
    const cicdRole = new iam.Role(this, `CicdRole`, {
      assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
      roleName: cicdResourceName,
    });

    // Allow Codebuild things
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          // Projects
          "codebuild:CreateProject",
          "codebuild:DeleteProject",
          "codebuild:UpdateProject",

          // Webhooks
          "codebuild:CreateWebhook",
          "codebuild:DeleteWebhook",
          "codebuild:UpdateWebhook",
        ],
        resources: [
          `arn:aws:codebuild:${this.region}:${this.account}:project/build-${appName}--*`,
          `arn:aws:codebuild:${this.region}:${this.account}:project/pr-${appName}--*`,
        ],
      })
    );

    /**
     * This allows the cicd role permission to create and delete build/pr roles
     *
     * We can't restrict the principal that a role can be created with IAM itself
     * so we have to use a rule that is used with cloudformation guard to restrict it.
     */
    cicdRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:CreateRole", "iam:DeleteRole"],
        resources: [
          `arn:aws:iam::${this.account}:role/build-${appName}--*`,
          `arn:aws:iam::${this.account}:role/pr-${appName}--*`,
        ],
      })
    );

    /**
     * The CICD Deployment role is a CodeBuild Service Role
     * It is used during the create/update of a CICD Stack
     */
    const cicdDeploymentRole = new iam.Role(this, `DeploymentRole`, {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      roleName: `${cicdResourceName}-deployment`,
    });

    /**
     * The allows the deployment role to create/update Cloudformation Stacks
     */
    const stackArns = [stackArn, `${stackArn}/*`];
    const commonCfnConditions = {
      StringEquals: {
        "cloudformation:RoleArn": [cicdRole.roleArn],
      },
    };

    cicdDeploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:CreateStack"],
        resources: stackArns,
        conditions: {
          ...commonCfnConditions,
          // TODO: Add condition that requires an automation-group tag
        },
      })
    );

    cicdDeploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudformation:CreateChangeSet",
          "cloudformation:GetTemplate",
          "cloudformation:UpdateStack",
        ],
        resources: [stackArn, `${stackArn}/*`],
        conditions: {
          StringEquals: {
            "cloudformation:RoleArn": [cicdRole.roleArn],
          },
        },
      })
    );

    /**
     * This allows the deployment role to pass the app service role
     */
    cicdDeploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [cicdRole.roleArn],
        conditions: {
          StringEquals: {
            "iam:PassedToService": "cloudformation.amazonaws.com",
            "iam:AssociatedResourceArn": stackArn,
          },
        },
      })
    );

    /**
     * This is a generic permission that is required when using Cloudformation
     */
    cicdDeploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: [`*`],
      })
    );

    const deployCommand = [
      "npx",
      "cdk",
      "deploy",
      `${appName}-cicd`,
      `--role-arn ${cicdRole.roleArn}`,
    ];

    const target = ".ramsey/cicd";

    const source = codebuild.Source.gitHub({
      owner: cdk.Fn.ref("Owner"),
      repo: appName,
      webhook: true,
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
          .andBranchIs("master")
          .andFilePathIs(`${target}/*`),
      ],
    });

    new codebuild.Project(this, `DeploymentProject`, {
      projectName: cicdResourceName,
      role: cicdDeploymentRole,
      source,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              `cd ${target}`,
              "yarn", // Install Dependencies
              deployCommand.join(" "),
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
        privileged: false,
      },
    });
  }
}
