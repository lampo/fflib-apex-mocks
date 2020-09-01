import * as core from "rs-cdk/core";
import * as cdk from '@aws-cdk/core'
import * as codebuild from "@aws-cdk/aws-codebuild";
import * as iam from "@aws-cdk/aws-iam";

export interface WsProps extends cdk.StackProps {
    app: core.App;
}

export class Ws extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: WsProps) {
        super(scope, id, props);
        const app = props.app;

        const cicdRole = new iam.Role(this, `${app.repo.name}Role`, {
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
                `arn:aws:codebuild:${this.region}:${this.account}:project/build-${app.repo.name}--*`,
                `arn:aws:codebuild:${this.region}:${this.account}:project/pr-${app.repo.name}--*`
            ]
        }));
        
        // Allow create build roles for codebuild
        cicdRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'iam:CreateRole',
                'iam:DeleteRole',
            ],
            resources: [
                `arn:aws:iam::${this.account}:role/build-${app.repo.name}--*`,
                `arn:aws:iam::${this.account}:role/pr-${app.repo.name}--*`
            ]
        }));
        
        const cicdDeploymentRole = new iam.Role(this, `${app.repo.name}CicdDeploymentRole`, {
            assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
            roleName: `${app.repo.name}--cicd-deployment`
        });
        
        cicdDeploymentRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'cloudformation:CreateStack',
                'cloudformation:UpdateStack'
            ],
            resources: [
                `arn:aws:cloudformation:${this.region}:${this.account}:stack/${app.repo.name}--cicd`,
            ]
        }));
        cicdRole.grantPassRole(cicdDeploymentRole);
        
        new codebuild.Project(this, `${app.repo.name}CicdDeployment`, {
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
                            `npx cdk synth ${app.repo.name}-cicd`
                        ]
                    }
                }
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
                privileged: false
            }
        });
        
    }
}
