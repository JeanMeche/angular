import {
  isClassEntry,
  isConstantEntry,
  isDecoratorEntry,
  isEnumEntry,
  isFunctionEntry,
  isInterfaceEntry,
  isTypeAliasEntry,
} from '../../entities/categorization.mjs';
import {MemberType} from '../../entities/entities.mjs';
import {
  ClassEntryRenderable,
  ConstantEntryRenderable,
  DecoratorEntryRenderable,
  DocEntryRenderable,
  EnumEntryRenderable,
  FunctionEntryRenderable,
  InterfaceEntryRenderable,
  MemberEntryRenderable,
  MethodEntryRenderable,
  TypeAliasEntryRenderable,
} from './renderables.mjs';

export function isClassEntryRenderable(
  renderable: DocEntryRenderable,
): renderable is ClassEntryRenderable {
  return isClassEntry(renderable);
}

export function isInterfaceEntryRenderable(
  entry: MemberEntryRenderable,
): entry is InterfaceEntryRenderable & MemberEntryRenderable;
export function isInterfaceEntryRenderable(
  entry: DocEntryRenderable,
): entry is InterfaceEntryRenderable;
export function isInterfaceEntryRenderable(
  renderable: MemberEntryRenderable | DocEntryRenderable,
): renderable is InterfaceEntryRenderable {
  return isInterfaceEntry(renderable as DocEntryRenderable);
}

export function isDecoratorEntryRenderable(
  renderable: DocEntryRenderable,
): renderable is DecoratorEntryRenderable {
  return isDecoratorEntry(renderable);
}

export function isConstantEntryRenderable(
  renderable: DocEntryRenderable,
): renderable is ConstantEntryRenderable {
  return isConstantEntry(renderable);
}

export function isEnumEntryRenderable(
  renderable: DocEntryRenderable,
): renderable is EnumEntryRenderable {
  return isEnumEntry(renderable);
}

export function isFunctionEntryRenderable(
  renderable: DocEntryRenderable,
): renderable is FunctionEntryRenderable {
  return isFunctionEntry(renderable);
}

export function isTypeAliasEntryRenderable(
  renderable: DocEntryRenderable,
): renderable is TypeAliasEntryRenderable {
  return isTypeAliasEntry(renderable);
}

export function isClassMethodEntryRenderable(
  renderable: MemberEntryRenderable,
): renderable is MethodEntryRenderable {
  return renderable.memberType === MemberType.Method;
}
