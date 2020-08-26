import rs from "rs-cdk";
import hub from 'rs-cdk/accounts/hub';
import * as codebuild from '@aws-cdk/aws-codebuild';

const app = new rs.core.App({
    billing: rs.core.BillingTags.GLOBAL,
    name: 'salesforce-apex-mocks'
});

const stack = new rs.core.Stack(app, `${app.repo.name}-cicd`, {
  env: hub.cicd
})

new rs.cicd.PRBuild(stack, "PRBuild", {
    repo: app.repo,
    buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('appirio/dx-appirio:3.0.0.181539')
});
