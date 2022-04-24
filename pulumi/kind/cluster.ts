import * as pulumi from "@pulumi/pulumi";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, unlinkSync } from "fs";

interface KindInputs {
  clusterName: string;
  kubeConfigPath?: string;
}

interface KindOutputs {
  kubeContext: string;
  kubeConfig: string;
  kindConfigHash: string;
}

export class KindClusterProvider implements pulumi.dynamic.ResourceProvider {
  getKindConfigHash(): string {
    const kindConfig = readFileSync("./kind/kind.yaml");
    const hash = createHash("md5");
    hash.update(kindConfig);
    return hash.digest("hex");
  }

  async create(inputs: KindInputs): Promise<pulumi.dynamic.CreateResult> {
    const kubeConfigPath =`./${inputs.clusterName}-kubeconfig`;
    const cmdString = `kind create cluster --name ${inputs.clusterName} --config ./kind/kind.yaml --kubeconfig=${kubeConfigPath}`;

    execSync(cmdString, { stdio: "inherit" });

    const kubeConfig = readFileSync(kubeConfigPath).toString();

    return {
      id: inputs.clusterName,
      outs: {
        kubeContext: `kind-${inputs.clusterName}`,
        kubeConfig,
        kubeConfigPath,
        kindConfigHash: this.getKindConfigHash()
      }
    };
  }

  async diff(
    id: string,
    olds: KindOutputs,
    _news: KindOutputs
  ): Promise<pulumi.dynamic.DiffResult> {
    if (olds.kindConfigHash !== this.getKindConfigHash()) {
      return { changes: true };
    }

    try {
      execSync(`kind get clusters | grep ${id}`);
      return { changes: false };
    } catch (error) {
      return { changes: true };
    }
  }

  async update(
    id: string,
    _olds: KindInputs,
    news: KindInputs
  ): Promise<pulumi.dynamic.UpdateResult> {
    this.delete(id, {
      clusterName: news.clusterName,
      kubeConfigPath: news.kubeConfigPath
    });
    return this.create(news);
  }

  async delete(id: string, _props: KindInputs): Promise<void> {
    execSync(`kind delete cluster --name ${id}`, {
      stdio: "inherit"
    });
    const kubeConfigPath = `~/.${id}-kubeconfig`;
    unlinkSync(kubeConfigPath);
  }
}

export class KindCluster extends pulumi.dynamic.Resource {
  public readonly name: string;
  public readonly kubeConfig!: pulumi.Output<string>;
  public readonly kubeConfigPath!: pulumi.Output<string>;
  public readonly kubeContext!: pulumi.Output<string>;
  public readonly kindConfigHash!: pulumi.Output<string>;

  constructor(
    name: string,
    props: KindInputs,
    opts?: pulumi.CustomResourceOptions
  ) {
    super(
      new KindClusterProvider(),
      name,
      { ...props, kindConfigHash: null, kubeConfig: null, kubeContext: null },
      opts
    );
    this.name = name;
  }
}