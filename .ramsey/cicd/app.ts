import rs from "rs-cdk";
import hub from "rs-cdk/accounts/hub";
import * as codebuild from "@aws-cdk/aws-codebuild";
import * as iam from "@aws-cdk/aws-iam";
import * as ecr from "@aws-cdk/aws-ecr";

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
    actions: ["ssm:GetParameter*"],
    resources: [
      `arn:aws:ssm:${stack.region}:${hub.cicd.account}:parameter/salesforce/*`,
    ],
  })
);

role.addToPolicy(
  new iam.PolicyStatement({
    actions: [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ],
    resources: [
      `arn:aws:ecr:${stack.region}:${hub.cicd.account}:repository/crm-appirio-base:*`,
    ],
  })
);

new rs.cicd.PRBuild(stack, "PRBuild", {
  repo: app.repo,
  role,
  buildImage: codebuild.LinuxBuildImage.fromEcrRepository(
    ecr.Repository.fromRepositoryName(
      stack,
      `AppirioBaseRepo`,
      "crm-appirio-base"
    ),
    "7"
  ),
});
