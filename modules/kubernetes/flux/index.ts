import { Command } from "@pulumi/command/local";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { execSync } from "child_process";
import { resolve } from "path";

import { provider } from "../cluster";

const fluxRelease = new k8s.helm.v3.Release(
  "flux",
  {
    name: "flux",
    namespace: "flux-system",
    chart: "flux2",
    version: "0.15.0",
    createNamespace: true,
    repositoryOpts: {
      repo: "https://fluxcd-community.github.io/helm-charts"
    }
  },
  { provider }
);

interface FluxKustomizationInputs {
  name: string;
  directory: string;
  readyTimeoutSeconds?: number;
}

const fluxConfig = new pulumi.Config("flux");
const gitRepoUrl = fluxConfig.require("repo-ssh-url");
const sshKeyPath =
  fluxConfig.getSecret("repo-private-key-path") || "~/.ssh/id_rsa";

const createGithubSecret = new Command(
  "create-github-secret",
  {
    create: pulumi.interpolate`flux create secret git github-secret --url=${gitRepoUrl} --private-key-file=${sshKeyPath}`
  },
  { dependsOn: [fluxRelease], parent: fluxRelease }
);

class FluxKustomizationProvider implements pulumi.dynamic.ResourceProvider {
  check?:
    | ((olds: any, news: any) => Promise<pulumi.dynamic.CheckResult>)
    | undefined;
  diff?:
    | ((id: string, olds: any, news: any) => Promise<pulumi.dynamic.DiffResult>)
    | undefined;
  async create(
    inputs: FluxKustomizationInputs
  ): Promise<pulumi.dynamic.CreateResult> {
    const kustomizeApply = new k8s.kustomize.Directory(
      `kustomization-${inputs.name}`,
      {
        directory: inputs.directory.toString()
      },
      { provider, dependsOn: [createGithubSecret], parent: fluxRelease }
    );

    execSync("kubectl wait ");
    return {
      id: inputs.name,
      outs: {
        kustomizationId: kustomizeApply.getCustomResource(
          inputs.name,
          "flux-system"
        ).id
      }
    };
  }
  read?:
    | ((id: string, props?: any) => Promise<pulumi.dynamic.ReadResult>)
    | undefined;
  update?:
    | ((
        id: string,
        olds: any,
        news: any
      ) => Promise<pulumi.dynamic.UpdateResult>)
    | undefined;
  delete?: ((id: string, props: any) => Promise<void>) | undefined;
}

export const fluxRepoKustomization = new k8s.kustomize.Directory(
  "flux-repos",
  {
    directory: `${resolve(".")}/cluster/repos`
  },
  { provider, dependsOn: [createGithubSecret], parent: fluxRelease }
);
