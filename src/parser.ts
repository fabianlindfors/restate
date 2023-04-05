import {
  alt,
  apply,
  buildLexer,
  expectEOF,
  expectSingleResult,
  list_sc,
  opt,
  rep_sc,
  seq,
  tok,
} from "typescript-parsec";

export type Model = {
  name: string;
  states: State[];
  transitions: Transition[];
  baseFields: Field[];
  prefix?: PrefixSetting;
};

type ModelComponent = State | Transition | Field | PrefixSetting;

export type State = {
  id: "STATE";
  name: string;
  extends: string[];
  fields: Field[];
};

export type Transition = {
  id: "TRANSITION";
  name: string;
  from?: string[];
  to: string[];
  fields: Field[];
};

export type Field = {
  id: "FIELD";
  name: string;
  type: Type;
};

export type Type = {
  id: "TYPE";
  name: string;
  nested?: Type;
};

export type PrefixSetting = {
  id: "PREFIX";
  prefix: string;
};

function isState(modelComponent: ModelComponent): modelComponent is State {
  return modelComponent.id == "STATE";
}

function isTransition(
  modelComponent: ModelComponent
): modelComponent is Transition {
  return modelComponent.id == "TRANSITION";
}

function isField(modelComponent: ModelComponent): modelComponent is Field {
  return modelComponent.id == "FIELD";
}

function isPrefixSetting(
  modelComponent: ModelComponent
): modelComponent is PrefixSetting {
  return modelComponent.id == "PREFIX";
}

enum TokenKind {
  KeywordModel,
  KeywordState,
  KeywordTransition,
  KeywordField,
  KeywordPrefix,

  Identifier,
  StringLiteral,

  RightArrow,
  Asterisk,
  Pipe,
  Colon,
  Comma,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Space,

  Comment,
}

const lexer = buildLexer([
  [true, /^model/g, TokenKind.KeywordModel],
  [true, /^state/g, TokenKind.KeywordState],
  [true, /^transition/g, TokenKind.KeywordTransition],
  [true, /^field/g, TokenKind.KeywordField],
  [true, /^prefix/g, TokenKind.KeywordPrefix],

  [true, /^[a-zA-Z]+/g, TokenKind.Identifier],
  [true, /^"\S*"/g, TokenKind.StringLiteral],

  [true, /^->/g, TokenKind.RightArrow],
  [true, /^\*/g, TokenKind.Asterisk],
  [true, /^\|/g, TokenKind.Pipe],
  [true, /^:/g, TokenKind.Colon],
  [true, /^,/g, TokenKind.Comma],
  [true, /^\{/g, TokenKind.LBrace],
  [true, /^\}/g, TokenKind.RBrace],
  [true, /^\[/g, TokenKind.LBracket],
  [true, /^\]/g, TokenKind.RBracket],

  [false, /^\s+/g, TokenKind.Space],

  [false, /^\/\/.*/g, TokenKind.Comment],
]);

const parseStringLiteral = apply(
  tok(TokenKind.StringLiteral),
  (literal): string => {
    return literal.text.substring(1, literal.text.length - 1);
  }
);

const parsePrefixSetting = apply(
  seq(tok(TokenKind.KeywordPrefix), parseStringLiteral),
  ([_1, literal]): PrefixSetting => {
    return {
      id: "PREFIX",
      prefix: literal,
    };
  }
);

const parseType = apply(
  seq(
    tok(TokenKind.Identifier),
    opt(
      seq(
        tok(TokenKind.LBracket),
        tok(TokenKind.Identifier),
        tok(TokenKind.RBracket)
      )
    )
  ),
  ([name, nestedTokens]): Type => {
    let nested: Type | undefined = undefined;
    if (nestedTokens !== undefined) {
      nested = {
        id: "TYPE",
        name: nestedTokens[1].text,
      };
    }

    return {
      id: "TYPE",
      name: name.text,
      nested,
    };
  }
);

const parseField = apply(
  seq(
    tok(TokenKind.KeywordField),
    tok(TokenKind.Identifier),
    tok(TokenKind.Colon),
    parseType
  ),
  ([_1, name, _2, type]): Field => {
    return {
      id: "FIELD",
      name: name.text,
      type: type,
    };
  }
);

const parseState = apply(
  seq(
    tok(TokenKind.KeywordState),
    tok(TokenKind.Identifier),

    opt(
      seq(
        tok(TokenKind.Colon),
        list_sc(tok(TokenKind.Identifier), tok(TokenKind.Comma))
      )
    ),

    tok(TokenKind.LBrace),
    rep_sc(parseField),
    tok(TokenKind.RBrace)
  ),
  ([_1, ident, ext, _2, fields]): State => {
    const extendedStates = ext?.[1].map((token) => token.text) ?? [];

    return {
      id: "STATE",
      name: ident.text,
      extends: extendedStates,
      fields,
    };
  }
);

const parseTransition = apply(
  seq(
    // transition NAME:
    tok(TokenKind.KeywordTransition),
    tok(TokenKind.Identifier),
    tok(TokenKind.Colon),

    // STATE1 | STATE2 ->
    opt(
      seq(
        alt(
          tok(TokenKind.Asterisk),
          list_sc(tok(TokenKind.Identifier), tok(TokenKind.Pipe))
        ),
        tok(TokenKind.RightArrow)
      )
    ),

    // STATE3 | STATE4
    alt(
      tok(TokenKind.Asterisk),
      list_sc(tok(TokenKind.Identifier), tok(TokenKind.Pipe))
    ),

    // {}
    tok(TokenKind.LBrace),
    rep_sc(parseField),
    tok(TokenKind.RBrace)
  ),
  ([_1, ident, _2, from, to, _4, fields, _5]): Transition => {
    // A from state doesn't have to be specified. If it's not, then it's
    // an initializing transition.
    let fromResult: string[] | undefined = undefined;
    if (from) {
      const fromStates = from[0];
      const fromTokens = Array.isArray(fromStates) ? fromStates : [fromStates];
      fromResult = fromTokens.map((token) => token.text);
    }

    const toTokens = Array.isArray(to) ? to : [to];

    return {
      id: "TRANSITION",
      name: ident.text,
      from: fromResult,
      to: toTokens.map((token) => token.text),
      fields: fields,
    };
  }
);

const parseModel = apply(
  seq(
    tok(TokenKind.KeywordModel),
    tok(TokenKind.Identifier),

    tok(TokenKind.LBrace),
    rep_sc(alt(parseState, parseTransition, parseField, parsePrefixSetting)),
    tok(TokenKind.RBrace)
  ),
  ([_1, ident, _2, components]): Model => {
    const states: State[] = components.filter(isState);
    const transitions: Transition[] = components.filter(isTransition);
    const baseFields: Field[] = components.filter(isField);

    const prefixSetting: PrefixSetting | undefined =
      components.filter(isPrefixSetting)[0];

    return {
      name: ident.text,
      states,
      transitions,
      baseFields: baseFields,
      prefix: prefixSetting,
    };
  }
);

const parseModels = rep_sc(parseModel);

export function parse(input: string): Model[] {
  const tokens = lexer.parse(input);
  return expectSingleResult(expectEOF(parseModels.parse(tokens)));
}
