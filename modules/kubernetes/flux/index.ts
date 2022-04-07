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
  remoteDir: string;
  readyTimeoutSeconds?: number;
  repoSource?: string;
}

interface FluxKustomizationOutputs {
  localDir: string;
  name: string;
}

const fluxConfig = new pulumi.Config("flux");
const gitRepoUrl = fluxConfig.require("repo-ssh-url");
const sshKeyPath =
  fluxConfig.getSecret("repo-private-key-path") || "~/.ssh/id_rsa";

/* 
Minimal bootstraping for the Flux controller
*/
const createGithubSecret = new Command(
  "create-github-secret",
  {
    create: pulumi.interpolate`flux create secret git github-secret --url=${gitRepoUrl} --private-key-file=${sshKeyPath}`
  },
  { dependsOn: [fluxRelease], parent: fluxRelease }
);

const githubSource = new k8s.yaml.ConfigFile(
  "github-source",
  {
    file: `${resolve(".")}/cluster/repos/git/k8s-homelab-repo.yaml`
  },
  { provider, dependsOn: [fluxRelease], parent: fluxRelease }
);

class FluxKustomizationProvider implements pulumi.dynamic.ResourceProvider {
  async diff(
    _id: string,
    _olds: FluxKustomizationOutputs,
    news: FluxKustomizationOutputs
  ): Promise<pulumi.dynamic.DiffResult> {
    try {
      execSync(`flux diff kustomization ${news.name} --path=${news.localDir}`, {
        stdio: "inherit"
      });
      return { changes: false };
    } catch (e) {
      return { changes: true };
    }
  }

  async create(
    inputs: FluxKustomizationInputs
  ): Promise<pulumi.dynamic.CreateResult> {
    const repoSource = inputs.repoSource || "k8s-homelab-repo";
    const timeout = inputs.readyTimeoutSeconds || 60;

    execSync(`flux reconcile source git ${repoSource}`);
    const kustomizeCreateCommand = `flux create kustomization ${inputs.name} --source=${repoSource} --path=${inputs.remoteDir} --wait --timeout=${timeout}s`;
    execSync(kustomizeCreateCommand, { stdio: "inherit" });

    return {
      id: inputs.name,
      outs: {
        directory: `${resolve(".")}/${inputs.remoteDir}`,
        name: inputs.name
      }
    };
  }

  async update(
    id: string,
    _olds: FluxKustomizationInputs,
    news: FluxKustomizationInputs
  ): Promise<pulumi.dynamic.UpdateResult> {
    const repoSource = news.repoSource || "k8s-homelab-repo";
    execSync(`flux reconcile source git ${repoSource}`);
    execSync(`flux reconcile kustomization ${id}`, { stdio: "inherit" });
    return {};
  }

  async delete(_id: string, props: FluxKustomizationInputs): Promise<void> {
    execSync(`flux delete kustomization ${props.name}`, { stdio: "inherit" });
  }
}

class FluxKustomization extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    props: FluxKustomizationInputs,
    opts?: pulumi.CustomResourceOptions
  ) {
    super(new FluxKustomizationProvider(), name, { ...props }, opts);
  }
}

export const fluxRepoKustomization = new FluxKustomization(
  "flux-repos",
  {
    name: "flux-repos",
    remoteDir: "cluster/repos"
  },
  { dependsOn: [githubSource], parent: fluxRelease }
);

export const fluxInfraKustomization = new FluxKustomization(
  "flux-infra",
  {
    name: "flux-infra",
    remoteDir: "cluster/infra"
  },
  { dependsOn: [fluxRepoKustomization], parent: fluxRelease }
);
