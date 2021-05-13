import { readFileSync, writeFileSync } from "fs";
import * as path from "path";

export function convertFile(file: string) {
  const extension = path.extname(file);
  const withoutExtension = file.substr(0, file.length - extension.length);
  const targetFile = `${withoutExtension}.ts`;
  const baseName = path.basename(file, extension);

  const content = readFileSync(file, "utf8");
  const result = convert(content, baseName);

  console.log(`Writing to "${targetFile}"...`);
  writeFileSync(targetFile, result);
}

function convert(input: string, name: string) {
  return convertImports(input, name);
}

function convertImports(input: string, name: string) {
  const items = [] as { name: string; path: string }[];
  let result = input.replace(
    /<!-- #include file="(.*?\/)?(.*?).asp" -->/gi,
    (input, group1, group2) => {
      const path = group1 || "./";
      const file = `${path}${group2}`;
      items.push({ name: group2, path: file });
      return `<%\n${group2}();\n%>`;
    }
  );

  result = convertCode(result);
  result = convertExpressions(result);
  result = convertStrings(result);

  //   result = `\nfunction ${name}() {\n${result}\n}`;

  for (const item of items) {
    result = `import {${item.name}} from "${item.path}"\n${result}`;
  }

  return result;
}

function convertCode(input: string) {
  let code = convertMany(input);
  code = convertClass(code);

  code = code.replace(/<%([^=][\s\S]*?)%>/gi, (input, group1) => {
    let code = convertVbsCode(group1);

    return `<%${code}%>`;
  });

  return code;
}

function convertVbsCode(input: string) {
  let code = input;

  code = convertComments(code);
  code = convertVariables(code);
  code = convertSwitchStatements(code);
  code = convertIfStatements(code);
  code = convertFunctions(code, false);
  code = convertForStatements(code);
  code = convertLoops(code);
  code = convertSplit(code);
  code = convertPRec(code);
  code = convertPLan(code);

  return code;
}

function convertClassContent(input: string) {
  let code = input;
  code = convertProperties(code);
  code = convertFunctions(code, true);

  return code;
}

function convertClass(input: string) {
  let result = input.replace(
    /Class\s+(\w+)\s*(.+?)End\s+Class\s*$/gims,
    (input, name, content) => {
      //   const condition = (group1);
      content = convertClassContent(content);
      content = convertClassFields(content);
      return `class ${name}{\n\t${content}\n}`;
    }
  );

  const regex = /Class\s+(\w+)\s*$(.+?)End\s+Class\s*$/gims;
  return result;
}

function convertExpressions(input: string) {
  const result = input.replace(/<%=([\s\S]*?)%>/gi, (input, group1) => {
    let content = convertPRec(group1);
    content = convertPLan(content);

    return "${" + content + "}";
  });

  return result;
}

function convertStrings(input: string) {
  let result = input.replace(/%>([\s\S]+?)<%/gi, "\nResponse.Write(`$1`);\n");

  // Entire document is a string
  if (result.indexOf("<%") === -1) {
    result = `Response.Write(\`${result}\`);`;
  }

  // Start of the document is a string
  const firstIndex = result.indexOf("<%");
  if (firstIndex > 0) {
    result = `Response.Write(\`${result.substr(
      0,
      firstIndex
    )}\`);\n${result.substring(firstIndex + 2)}`;
  }

  result = result.replace(/%>$/, "");

  // End of the document is a string
  const lastIndex = result.lastIndexOf("%>");
  if (lastIndex > -1 && lastIndex < result.length - 2) {
    result = `${result.substr(0, lastIndex)}\nResponse.Write(\`${result.substr(
      lastIndex + 3
    )}\`);`;
  }

  result = result.replace(/^<%/, "");

  return result;
}

function convertComments(input: string) {
  let result = "";
  const splitted = input.split(/(".*")/gm);
  for (const part of splitted) {
    if (part.indexOf(`"`) === 0) {
      result += part;
    } else {
      result += part.replace(/'/gi, "//");
    }
  }

  return result;
}

function convertIfStatements(input: string) {
  let result = input.replace(/if +(.*?) +then/gi, (input, group1) => {
    const condition = convertConditions(group1);
    return `\nif (${condition}) {\n`;
  });
  result = result.replace(/end if/gi, "\n}\n");
  result = result.replace(/else(?!{)/gi, "\n}\nelse {\n");

  return result;
}

function convertSwitchStatements(input: string) {
  return input
    .replace(/select case +(.*)/gi, "\nswitch ($1) {\n")
    .replace(/end select/gi, "\n}\n")
    .replace(/\sCase\s+else/gi, " default:")
    .replace(/\sCase\s+(\"\w+"|\w+)/gi, " case $1:");
}

function convertAccessor(text: string, inClass: boolean) {
  if (inClass) {
    return "\t" + (text?.toLowerCase() || "");
  }
  return "";
}

function convertFunctions(input: string, inClass: boolean) {
  const replaceFn = (
    input: string,
    accessor: string,
    type: string,
    name: string,
    params: string
  ) => {
    return `\n${convertAccessor(accessor, inClass)}${
      inClass ? "" : "function "
    }${name}(${params}) {\n`;
  };

  let result = input.replace(
    /((Private|Public)\s+?)?(?:function|sub)\s+(\w+)\((.*?)\)/gi,
    replaceFn
  );
  result = result.replace(
    /end\s+(?:function|sub)/gi,
    `\n${inClass ? "\t" : ""}}\n`
  );

  return result;
}

function convertPropertyType(text: string) {
  if (text.toLowerCase() === "let") return "set";
  return text.toLowerCase();
}

function convertProperties(input: string) {
  const replaceFn = (
    input: string,
    accessor: string,
    type: string,
    name: string,
    params: string
  ) => {
    return `\n${convertAccessor(accessor, true)} ${convertPropertyType(
      type
    )}${upperCaseFirst(name)}${params ?? "()"} {\n`;
  };

  let result = input.replace(
    /(Private|Public)?\s*Property\s+(Get|Set|Let)\s+(\w+)(\(.*?\))?\n/gi,
    replaceFn
  );

  result = result.replace(/end\s+(?:Property)/gi, "\n\t}\n");

  return result;
}

function convertClassFields(input: string) {
  //console.log("fields: " + input);
  const replaceFn = (input: string, accessor: string, names: string) => {
    return names
      .replace(/\s+/, "")
      .split(",")
      .map((name) => `\t${accessor?.toLowerCase() || ""} ${name}`)
      .join("\n");
  };

  let result = input.replace(
    /\s*(Private|Public)\s+([\s\w,]+?\n)/gi,
    replaceFn
  );
  return result;
}

function convertVariables(input: string) {
  let result = input.replace(/\s(?:Dim)\s+(\w+)\s*:\s*(Set)?\s/gi, "let ");
  result = result.replace(/\sDim\s/gi, " let ");
  result = result.replace(/\sSet\s/gi, "");
  result = result.replace(/(\s|=)Me\s/gi, "$1this");
  result = result.replace(/\sNew\s+(\w+)\s*\n/gi, " new $1()\n");
  result = result.replace(/\sNew\s/gi, " new ");
  result = result.replace(/\Call\s/gi, " ");
  return result;
}

function convertForStatements(input: string) {
  let result = input.replace(/for +(.*to.*)/gi, "\nfor ($1) {\n");
  result = result.replace(/^\s*next\s*$/gim, "}\n");

  return result;
}

function convertConditions(input: string) {
  let result = input.replace(/ +and +/gi, " && ");
  result = result.replace(/ +or +/gi, " || ");
  result = result.replace(/ +<> +/gi, " !== ");
  result = result.replace(/ += +/gi, " === ");

  return result;
}

function convertLoops(input: string) {
  let result = input.replace(/do until +(.*)/gi, (input, group1) => {
    const condition = convertConditions(group1);
    return `\nwhile (!(${condition})) {\n`;
  });
  result = result.replace(/^\s*loop\s*$/gm, "}\n");

  return result;
}

function convertMany(input: string) {
  return input
    .replace(/_\s*\n/g, "")
    .replace(/ByRef/gi, "/*ByRef*/")
    .replace(/Class_Initialize/gi, "ctor")
    .replace(/(\s|=)Nothing(\s*?\n)/gi, "$1undefined$2");
}

function convertSplit(input: string) {
  const result = input.replace(/Split\((.+?),(".+?")\)\s/gi, `$1.split($2);`);
  return result;
}

function convertPRec(input: string) {
  const result = input.replace(/(p_rec\("\S+?"\))/gi, "$1.Value");
  return result;
}

function convertPLan(input: string) {
  const result = input.replace(/(l_\S+?)\(p_lan\)/gi, "$1[p_lan]");
  return result;
}

function upperCaseFirst(input: string) {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
