import * as t from '@babel/types';
import { stripIndent } from 'common-tags';
import {
  GraphQLEnumType,
  GraphQLInputObjectType,
} from 'graphql';
import * as path from 'path';

import {
  CompilerContext,
  Operation,
  Fragment,
  SelectionSet,
  Field,
} from '../../compiler';

import {
  typeCaseForSelectionSet,
  Variant
} from '../../compiler/visitors/typeCase';

import {
  collectAndMergeFields
} from '../../compiler/visitors/collectAndMergeFields';

import { BasicGeneratedFile } from '../../utilities/CodeGenerator';
import TypescriptGenerator, { ObjectProperty, TypescriptCompilerOptions, } from './language';
import Printer from './printer';

class TypescriptGeneratedFile implements BasicGeneratedFile {
  fileContents: string;

  constructor(fileContents: string) {
    this.fileContents = fileContents;
  }
  get output() {
    return this.fileContents
  }
}

function printEnumsAndInputObjects(generator: TypescriptAPIGenerator, context: CompilerContext) {
  context;
  generator.printer.enqueue(stripIndent`
import * as g from 'graphql-types'
`);

/*
  generator.printer.enqueue(stripIndent`
    //==============================================================
    // START Enums and Input Objects
    // All enums and input objects are included in every output file
    // for now, but this will be changed soon.
    // TODO: Link to issue to fix this.
    //==============================================================
  `);

  context.typesUsed
    .filter(type => (type instanceof GraphQLEnumType))
    .forEach((enumType) => {
      generator.typeAliasForEnumType(enumType as GraphQLEnumType);
    });

  context.typesUsed
    .filter(type => type instanceof GraphQLInputObjectType)
    .forEach((inputObjectType) => {
      generator.typeAliasForInputObjectType(inputObjectType as GraphQLInputObjectType);
    });

  generator.printer.enqueue(stripIndent`
    //==============================================================
    // END Enums and Input Objects
    //==============================================================
  `)
*/
}

export function generateSource(
  context: CompilerContext,
) {
  const generator = new TypescriptAPIGenerator(context);
  const generatedFiles: { [filePath: string]: TypescriptGeneratedFile } = {};

  Object.values(context.operations)
    .forEach((operation) => {
      generator.fileHeader();
      generator.interfacesForOperation(operation);
      printEnumsAndInputObjects(generator, context);

      const output = generator.printer.printAndClear();

      const outputFilePath = path.join(
        path.dirname(operation.filePath),
        path.basename(operation.filePath, ".graphql") + ".tsx",
        // `${operation.operationName}${ucFirst(operation.operationType)}.tsx`
      );

      generatedFiles[outputFilePath] = new TypescriptGeneratedFile(output);
    });

  Object.values(context.fragments)
    .forEach((fragment) => {
      generator.fileHeader();
      generator.interfacesForFragment(fragment);
      printEnumsAndInputObjects(generator, context);

      const output = generator.printer.printAndClear();

      const outputFilePath = path.join(
        path.dirname(fragment.filePath),
        `F_${fragment.fragmentName}.ts`
      );

      generatedFiles[outputFilePath] = new TypescriptGeneratedFile(output);
    });

  return generatedFiles;
}

export class TypescriptAPIGenerator extends TypescriptGenerator {
  context: CompilerContext
  printer: Printer
  scopeStack: string[]

  constructor(context: CompilerContext) {
    super(context.options as TypescriptCompilerOptions);

    this.context = context;
    this.printer = new Printer();
    this.scopeStack = [];
  }

  fileHeader() {
    this.printer.enqueue(
      stripIndent`
        /* eslint-disable import/first */
        // This file was automatically generated and should not be edited.
      `
    );
  }

  public typeAliasForEnumType(enumType: GraphQLEnumType) {
    this.printer.enqueue(this.enumerationDeclaration(enumType));
  }

  public typeAliasForInputObjectType(inputObjectType: GraphQLInputObjectType) {
    this.printer.enqueue(this.exportDeclaration(
      this.inputObjectDeclaration(inputObjectType)));
  }

  public interfacesForOperation(operation: Operation) {
    const {
      operationType,
      operationName,
      variables,
      selectionSet,
      filePath
    } = operation;
console.log(filePath)
    this.scopeStackPush("Result");
    // this.scopeStackPush(operationName);

    this.printer.enqueue(stripIndent`
      // ====================================================
      // GraphQL ${operationType} operation: ${operationName}
      // ====================================================
    `)

    // The root operation only has one variant
    // Do we need to get exhaustive variants anyway?
    const variants = this.getVariantsForSelectionSet(selectionSet);

    const variant = variants[0];
    const properties = this.getPropertiesForVariant(variant);

    const exportedTypeAlias = this.exportDeclaration(
      this.interface("Result", properties)
    );

    this.printer.enqueue(exportedTypeAlias);
    this.scopeStackPop();

    // Generate the variables interface if the operation has any variables
    if (variables.length > 0) {
      const interfaceName = 'Variables';
      this.scopeStackPush(interfaceName);
      this.printer.enqueue(this.exportDeclaration(
        this.interface(interfaceName, variables.map((variable) => ({
          name: variable.name,
          type: this.typeFromGraphQLType(variable.type)
        })), { keyInheritsNullability: true })
      ));
      this.scopeStackPop();
    } else {
      this.printer.enqueue(`export interface Variables {}`)
    }

    // Check:
    // - https://github.com/Microsoft/TypeScript/issues/3960
    // - https://github.com/Microsoft/TypeScript/issues/6395
    // Waiting for TS 2.9:
    // - https://github.com/Microsoft/TypeScript/pull/22415

    // Tried:
    // - https://github.com/jamiebuilds/babel-handbook/blob/master/translations/en/plugin-handbook.md#toc-asts
    // - https://github.com/babel/babel/blob/master/packages/babylon/ast/spec.md
    // - http://astexplorer.net/
    // Can't make it work :-(

    if (operationType === "query") {
      let refetch
      if (variables.length > 0) {
        refetch = `
export function refetch(variables: Variables): G__.PureQueryOptions<Result, Variables> {
  return {
    query: Query,
    variables,
  }
}`
      } else {
        refetch = `
export function refetch(): G__.PureQueryOptions<Result, Variables> {
  return {
    query: Query,
  }
}`
      }

      this.printer.enqueue(`
import * as G__ from 'utils/ApolloTypeHelper'

import { loader } from 'graphql.macro';
const QueryX = loader('./${path.basename(filePath)}');
export const Query = QueryX as G__.Query<Result, Variables>

import * as React from 'react'

export const Component = G__.createQueryComponent<Result, Variables>(Query)
export type ComponentProps = G__.QueryComponentProps<Result, Variables>

export const CP = G__.createQueryComponentPassthrough<Result, Variables>(Query)
export type ComponentPropsPassthrough = G__.QueryComponentPropsPassthrough<Result, Variables>
export const CS = G__.createQueryComponentSimple<Result, Variables>(Query)
export type ComponentPropsSimple = G__.QueryComponentPropsSimple<Result, Variables>

export type QueryResult = G__.QueryResult<Result, Variables>
export type QueryResultSimple = G__.QueryResultSimple<Result, Variables>

export type PassthroughResult = G__.PassthroughResult<Result>
export type SimpleResult = G__.SimpleResult<Result>

export function useQuery(options?: G__.QueryHookOptions<Result, Variables>): G__.QueryResult<Result, Variables> {
	return G__.useQuery1(Query, options)
}

export function withQueryPassthrough<TInputProps = {}>(
  WrappedComponent: React.ComponentType<TInputProps & PassthroughResult>,
  queryProps?: ComponentPropsPassthrough,
): React.SFC<TInputProps> {
  return G__.withQueryPassthrough<TInputProps, Result, Variables>(WrappedComponent, CP, queryProps)
}

export function withQuerySinple<TInputProps = {}>(
  WrappedComponent: React.ComponentType<TInputProps & SimpleResult>,
  queryProps?: ComponentPropsSimple,
): React.SFC<TInputProps> {
  return G__.withQuerySinple<TInputProps, Result, Variables>(WrappedComponent, CS, queryProps)
}

// To be used with refetchQueries
${refetch}`);

    } else {
      this.printer.enqueue(`
import * as G__ from 'utils/ApolloTypeHelper'
import * as M__ from 'elements/apollo/MutationCommon'
import * as M0 from 'elements/apollo/Mutation0'
import * as M1 from 'elements/apollo/Mutation1'

import { loader } from 'graphql.macro';
const MutationX = loader('./${path.basename(filePath)}');
export const Mutation = MutationX as G__.MutationNode<Result, Variables>

export type MutationFn = M__.MutationFn<Result, Variables>;

// Hooks
export function use0() {
  return M0.useMutation0(Mutation)
}

export function use1() {
  return M1.useMutation1(Mutation)
}

import * as React from 'react'

// Standard component
export type ComponentProps = Omit<M__.MutationProps<Result, Variables>, "mutation">
export const Component = M1.createMutationComponent<Result, Variables>(Mutation)

// HOC
export type Props = M__.WrappedProps<Result, Variables>
export function withMutation<TInputProps = {}>(WrappedComponent: React.ComponentType<TInputProps & Props>): React.FC<TInputProps> {
  return M1.withMutation1<Result, Variables, TInputProps>(Mutation, WrappedComponent)
}
`);
    }
  }

  public interfacesForFragment(fragment: Fragment) {
    const {
      fragmentName,
      selectionSet
    } = fragment;
    this.scopeStackPush("Fragment");

    this.printer.enqueue(stripIndent`
      // ====================================================
      // GraphQL fragment: ${fragmentName}
      // ====================================================
    `);

    const variants = this.getVariantsForSelectionSet(selectionSet);

    if (variants.length === 1) {
      const properties = this.getPropertiesForVariant(variants[0]);

      const name = this.nameFromScopeStack(this.scopeStack);
      const exportedTypeAlias = this.exportDeclaration(
        this.interface(
          name,
          properties
        )
      );

      this.printer.enqueue(exportedTypeAlias);
    } else {
      const unionMembers: t.Identifier[] = [];
      variants.forEach(variant => {
        this.scopeStackPush(variant.possibleTypes[0].toString());
        const properties = this.getPropertiesForVariant(variant);

        const name = this.nameFromScopeStack(this.scopeStack);
        const exportedTypeAlias = this.exportDeclaration(
          this.interface(
            name,
            properties
          )
        );

        this.printer.enqueue(exportedTypeAlias);

        unionMembers.push(t.identifier(this.nameFromScopeStack(this.scopeStack)));

        this.scopeStackPop();
      });

      this.printer.enqueue(
        this.exportDeclaration(
          this.typeAliasGenericUnion(
            this.nameFromScopeStack(this.scopeStack),
            unionMembers.map((id) => t.TSTypeReference(id))
          )
        )
      );
    }

    this.scopeStackPop();
  }

  private getVariantsForSelectionSet(selectionSet: SelectionSet) {
    return this.getTypeCasesForSelectionSet(selectionSet).exhaustiveVariants;
  }

  private getTypeCasesForSelectionSet(selectionSet: SelectionSet) {
    return typeCaseForSelectionSet(
      selectionSet,
      this.context.options.mergeInFieldsFromFragmentSpreads
    );
  }

  private getPropertiesForVariant(variant: Variant): ObjectProperty[] {
    const fields = collectAndMergeFields(
      variant,
      this.context.options.mergeInFieldsFromFragmentSpreads
    );
    return fields.map(field => {
      const fieldName = field.alias !== undefined ? field.alias : field.name;
      this.scopeStackPush(fieldName);

      let res: ObjectProperty;
      if (field.selectionSet) {
        res = this.handleFieldSelectionSetValue(
          t.identifier(this.nameFromScopeStack(this.scopeStack)),
          field
        );
      } else {
        res = this.handleFieldValue(
          field,
          variant
        );
      }

      this.scopeStackPop();
      return res;
    });
  }

  private handleFieldSelectionSetValue(generatedIdentifier: t.Identifier, field: Field): ObjectProperty {
    const { selectionSet } = field;

    const type = this.typeFromGraphQLType(field.type, generatedIdentifier.name);

    const typeCase = this.getTypeCasesForSelectionSet(selectionSet as SelectionSet);
    const variants = typeCase.exhaustiveVariants;

    let exportedTypeAlias;
    if (variants.length === 1) {
      const variant = variants[0];
      const properties = this.getPropertiesForVariant(variant);
      exportedTypeAlias = this.exportDeclaration(
        this.interface(
          this.nameFromScopeStack(this.scopeStack),
          properties
        )
      );
    } else {
      const identifiers = variants.map(variant => {
        this.scopeStackPush(variant.possibleTypes[0].toString())
        const properties = this.getPropertiesForVariant(variant);
        const identifierName = this.nameFromScopeStack(this.scopeStack);

        this.printer.enqueue(this.exportDeclaration(
          this.interface(
            identifierName,
            properties
          )
        ));

        this.scopeStackPop();
        return t.identifier(identifierName);
      });

      exportedTypeAlias = this.exportDeclaration(
        this.typeAliasGenericUnion(
          generatedIdentifier.name,
          identifiers.map(i => t.TSTypeReference(i))
        )
      );
    }

    this.printer.enqueue(exportedTypeAlias);

    return {
      name: field.alias ? field.alias : field.name,
      description: field.description,
      type
    };
  }

  private handleFieldValue(field: Field, variant: Variant): ObjectProperty {
    let res: ObjectProperty;
    if (field.name === '__typename') {
      const types = variant.possibleTypes
        .map(type => {
          return t.TSLiteralType(t.stringLiteral(type.toString()));
        });

      res = {
        name: field.alias ? field.alias : field.name,
        description: field.description,
        type: t.TSUnionType(types)
      };
    } else {
      // TODO: Double check that this works
      res = {
        name: field.alias ? field.alias : field.name,
        description: field.description,
        type: this.typeFromGraphQLType(field.type)
      };
    }

    return res;
  }

  public get output(): string {
    return this.printer.print();
  }

  scopeStackPush(name: string) {
    this.scopeStack.push(name);
  }

  scopeStackPop() {
    const popped = this.scopeStack.pop()
    return popped;
  }

}
