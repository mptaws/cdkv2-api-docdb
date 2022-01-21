import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class Cdkv2ApiDocdbStack extends cdk.Stack {

  readonly SECRETNAME = "/myapp/mydocdb/masteruser";

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "DocDbVpc", {
      cidr: "10.3.0.0/16",
      maxAzs: 2,
      natGateways: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true,

      subnetConfiguration: [{
        cidrMask: 24,
        name: 'db',
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
      }, {
        cidrMask: 24,
        name: 'dmz',
        subnetType: ec2.SubnetType.PUBLIC,
      }],
    });

    const cluster = new docdb.DatabaseCluster(this, 'docdbDatabaseTest', {
      masterUser: {
        username: 'myuser',
        excludeCharacters: '\"@/:', // TODO: add more symbols to allow for easier console connect
        secretName: this.SECRETNAME,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.R5, ec2.InstanceSize.LARGE),
      instances: 1,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      vpc,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    cluster.connections.allowDefaultPortFromAnyIpv4('too open for now');

    const dnCrudIAMRole = new iam.Role(this, 'dnCrudIAMRole', {
      roleName: 'dnCrudIAMRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDocDBFullAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
      ]
    })

    const certLayer = new lambda.LayerVersion(this, 'certLayer', {
      code: lambda.Code.fromAsset("lib/lambdas/certLayer"),
      layerVersionName: 'certLayer',
      description: 'Dependency Layer for Certificates',
      compatibleRuntimes: [lambda.Runtime.DOTNET_CORE_3_1],
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const createOneLambda = new lambda.Function(this, 'createOneLambda', {
        runtime: lambda.Runtime.DOTNET_CORE_3_1,
        code: lambda.Code.fromAsset("lib/lambdas/createOneLambda"),
        handler: 'createOneLambda::dnCrud.Function::FunctionHandler',
        timeout: cdk.Duration.seconds(30),
        layers: [certLayer],
        environment: {
          HOME: '/tmp',
          SECRETNAME: this.SECRETNAME,
          REGION: 'us-west-2'
        },
        vpc,
        role: dnCrudIAMRole
    });

    const getAllLambda = new lambda.Function(this, 'getAllLambda', {
      runtime: lambda.Runtime.DOTNET_CORE_3_1,
      code: lambda.Code.fromAsset("lib/lambdas/getAllLambda"),
      handler: 'getAllLambda::dnCrud.Function::FunctionHandler',
      timeout: cdk.Duration.seconds(30),
      layers: [certLayer],
      environment: {
        HOME: '/tmp',
        SECRETNAME: this.SECRETNAME,
        REGION: 'us-west-2'
      },
      vpc,
      role: dnCrudIAMRole
    });

    const getOneLambda = new lambda.Function(this, 'getOneLambda', {
      runtime: lambda.Runtime.DOTNET_CORE_3_1,
      code: lambda.Code.fromAsset("lib/lambdas/getOneLambda"),
      handler: 'getOneLambda::dnCrud.Function::FunctionHandler',
      timeout: cdk.Duration.seconds(30),
      layers: [certLayer],
      environment: {
        HOME: '/tmp',
        SECRETNAME: this.SECRETNAME,
        REGION: 'us-west-2'
      },
      vpc,
      role: dnCrudIAMRole
    });

    const updateOneLambda = new lambda.Function(this, 'updateOneLambda', {
      runtime: lambda.Runtime.DOTNET_CORE_3_1,
      code: lambda.Code.fromAsset("lib/lambdas/updateOneLambda"),
      handler: 'updateOneLambda::dnCrud.Function::FunctionHandler',
      timeout: cdk.Duration.seconds(30),
      layers: [certLayer],
      environment: {
        HOME: '/tmp',
        SECRETNAME: this.SECRETNAME,
        REGION: 'us-west-2'
      },
      vpc,
      role: dnCrudIAMRole
    });

    const deleteOneLambda = new lambda.Function(this, 'deleteOneLambda', {
      runtime: lambda.Runtime.DOTNET_CORE_3_1,
      code: lambda.Code.fromAsset("lib/lambdas/deleteOneLambda"),
      handler: 'deleteOneLambda::dnCrud.Function::FunctionHandler',
      timeout: cdk.Duration.seconds(30),
      layers: [certLayer],
      environment: {
        HOME: '/tmp',
        SECRETNAME: this.SECRETNAME,
        REGION: 'us-west-2'
      },
      vpc,
      role: dnCrudIAMRole
    });

   const createOneIntegration = new apigateway.LambdaIntegration(createOneLambda);
   const getAllIntegration = new apigateway.LambdaIntegration(getAllLambda);

   const getOneIntegration = new apigateway.LambdaIntegration(getOneLambda);
   const updateOneIntegration = new apigateway.LambdaIntegration(updateOneLambda);
   const deleteOneIntegration = new apigateway.LambdaIntegration(deleteOneLambda);

   const api = new apigateway.RestApi(this, "crud-api", {
      restApiName: "Serverless Crud Service",
      description: "API for access to CRUD Lambdas to DocumentDb"
   });

   const theapi = api.root.addResource('api');
   theapi.addMethod('POST', createOneIntegration);
   theapi.addMethod('GET', getAllIntegration);
   addCorsOptions(theapi);

   const singleItem = theapi.addResource('{id}');
   singleItem.addMethod('GET', getOneIntegration);
   singleItem.addMethod('PATCH', updateOneIntegration);
   singleItem.addMethod('DELETE', deleteOneIntegration);
   addCorsOptions(singleItem);

  }
}

export function addCorsOptions(apiResource: apigateway.IResource) {
  apiResource.addMethod('OPTIONS', new apigateway.MockIntegration({
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Credentials': "'false'",
        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
      },
    }],
    passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    requestTemplates: {
      "application/json": "{\"statusCode\": 200}"
    },
  }), {
    methodResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': true,
        'method.response.header.Access-Control-Allow-Methods': true,
        'method.response.header.Access-Control-Allow-Credentials': true,
        'method.response.header.Access-Control-Allow-Origin': true,
      },
    }]
  })
}
