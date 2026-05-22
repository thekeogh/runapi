import { Hono } from 'hono';
import path from 'node:path';
import ts from 'typescript';

export const signatureRoute = new Hono();

type SignatureBody = {
  exportName?: string;
  methodName?: string;
  serviceRoot?: string;
  targetFile?: string;
};

type TypeProperty = {
  name: string;
  optional: boolean;
  type: string;
  properties?: TypeProperty[];
};

type SignatureParam = {
  name: string;
  optional: boolean;
  type: string;
  properties?: TypeProperty[];
};

type SignatureInfo = {
  label: string;
  params: SignatureParam[];
  returnType: string;
  returnProperties?: TypeProperty[];
};

const typeFormatFlags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.WriteArrayAsGenericType;

function loadProgram(serviceRoot: string): { checker: ts.TypeChecker; program: ts.Program } {
  const configPath = ts.findConfigFile(serviceRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    throw new Error(`No tsconfig.json found from ${serviceRoot}`);
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
    { noEmit: true },
    configPath
  );

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options
  });

  return { checker: program.getTypeChecker(), program };
}

function typeToString(checker: ts.TypeChecker, type: ts.Type, node?: ts.Node): string {
  return checker.typeToString(type, node, typeFormatFlags);
}

function isOptionalParameter(symbol: ts.Symbol): boolean {
  return Boolean(symbol.valueDeclaration && ts.isParameter(symbol.valueDeclaration) && (
    symbol.valueDeclaration.questionToken ||
    symbol.valueDeclaration.initializer
  ));
}

function isScalarType(type: ts.Type): boolean {
  if (type.flags & (
    ts.TypeFlags.String |
    ts.TypeFlags.StringLiteral |
    ts.TypeFlags.Number |
    ts.TypeFlags.NumberLiteral |
    ts.TypeFlags.Boolean |
    ts.TypeFlags.BooleanLiteral |
    ts.TypeFlags.BigInt |
    ts.TypeFlags.BigIntLiteral |
    ts.TypeFlags.Null |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Void |
    ts.TypeFlags.Any |
    ts.TypeFlags.Unknown
  )) {
    return true;
  }
  return false;
}

function isArrayLikeType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

function shouldExpand(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (type.isUnionOrIntersection() || isScalarType(type) || isArrayLikeType(checker, type)) {
    return false;
  }
  if (type.getCallSignatures().length > 0) {
    return false;
  }
  return type.getProperties().length > 0 || Boolean(
    checker.getIndexTypeOfType(type, ts.IndexKind.String) ||
    checker.getIndexTypeOfType(type, ts.IndexKind.Number)
  );
}

function describeProperties(
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.Node,
  depth = 0
): TypeProperty[] | undefined {
  if (depth >= 3 || !shouldExpand(checker, type)) {
    return;
  }

  const properties = type.getProperties().slice(0, 40).map((property) => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? node;
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
    return {
      name: property.getName(),
      optional: Boolean(property.flags & ts.SymbolFlags.Optional),
      type: typeToString(checker, propertyType, declaration),
      properties: describeType(checker, propertyType, declaration, depth + 1)
    };
  });

  return properties.length > 0 ? properties : undefined;
}

function describeType(
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.Node,
  depth = 0
): TypeProperty[] | undefined {
  const properties = describeProperties(checker, type, node, depth) ?? [];
  return properties.length > 0 ? properties : undefined;
}

function resolvedReturnType(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  return checker.getAwaitedType(type) ?? type;
}

function findExportSymbol(checker: ts.TypeChecker, sourceFile: ts.SourceFile, exportName: string): ts.Symbol | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  return exports.find((symbol) => symbol.getName() === exportName);
}

function signatureLabel(signature: ts.Signature, checker: ts.TypeChecker, node: ts.Node, methodName: string): string {
  const params = signature.getParameters().map((param) => {
    const declaration = param.valueDeclaration ?? param.declarations?.[0] ?? node;
    const type = checker.getTypeOfSymbolAtLocation(param, declaration);
    const optional = isOptionalParameter(param);
    return `${param.getName()}${optional ? '?' : ''}: ${typeToString(checker, type, declaration)}`;
  });
  return `${methodName}(${params.join(', ')}): ${typeToString(checker, signature.getReturnType(), node)}`;
}

function inspectSignature(body: SignatureBody): { signatures: SignatureInfo[] } {
  const serviceRoot = path.resolve(body.serviceRoot ?? '');
  const targetFile = body.targetFile ?? '';
  const exportName = body.exportName ?? '';
  const methodName = body.methodName ?? '';

  if (!body.serviceRoot?.trim()) throw new Error('Enter a service root first.');
  if (!targetFile.trim()) throw new Error('Enter a target file first.');
  if (!exportName.trim()) throw new Error('Enter an export first.');

  const absoluteFile = path.isAbsolute(targetFile) ? targetFile : path.resolve(serviceRoot, targetFile);
  const { checker, program } = loadProgram(serviceRoot);
  const sourceFile = program.getSourceFile(absoluteFile);
  if (!sourceFile) {
    throw new Error(`File is not part of the TypeScript program: ${absoluteFile}`);
  }

  const exportSymbol = findExportSymbol(checker, sourceFile, exportName);
  if (!exportSymbol) {
    throw new Error(`Export not found: ${exportName}`);
  }

  const exportDeclaration = exportSymbol.valueDeclaration ?? exportSymbol.declarations?.[0] ?? sourceFile;
  const exportType = checker.getTypeOfSymbolAtLocation(exportSymbol, exportDeclaration);
  const methodSymbol = methodName ? checker.getPropertyOfType(exportType, methodName) : undefined;
  const callableType = methodName
    ? methodSymbol ? checker.getTypeOfSymbolAtLocation(methodSymbol, methodSymbol.valueDeclaration ?? methodSymbol.declarations?.[0] ?? exportDeclaration) : undefined
    : exportType;

  if (!callableType) {
    throw new Error(methodName ? `Method not found: ${methodName}` : `Export is not callable: ${exportName}`);
  }

  const signatures = callableType.getCallSignatures();
  return {
    signatures: signatures.map((signature: ts.Signature) => {
      const declaration = signature.getDeclaration() ?? exportDeclaration;
      const params = signature.getParameters().map((param: ts.Symbol) => {
        const paramDeclaration = param.valueDeclaration ?? param.declarations?.[0] ?? declaration;
        const type = checker.getTypeOfSymbolAtLocation(param, paramDeclaration);
        return {
          name: param.getName(),
          optional: isOptionalParameter(param),
          type: typeToString(checker, type, paramDeclaration),
          properties: describeType(checker, type, paramDeclaration)
        };
      });
      const returnType = signature.getReturnType();
      const awaitedReturnType = resolvedReturnType(checker, returnType);

      return {
        label: signatureLabel(signature, checker, declaration, methodName || exportName),
        params,
        returnType: typeToString(checker, returnType, declaration),
        returnProperties: describeType(checker, awaitedReturnType, declaration)
      };
    })
  };
}

signatureRoute.post('/signature', async (c) => {
  try {
    return c.json(inspectSignature(await c.req.json<SignatureBody>()));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
