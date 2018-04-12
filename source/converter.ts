import { readFileSync, writeFileSync } from "fs";
import * as path from 'path';

export function convertFile(file: string) {
    const extension = path.extname(file);
    const withoutExtension = file.substr(0, file.length - extension.length);
    const targetFile = `${withoutExtension}.ts`;
    const baseName = path.basename(file, extension);

    const content = readFileSync(file, 'utf8');
    const result = convert(content, baseName);

    console.log(`Writing to "${targetFile}"...`)
    writeFileSync(targetFile, result);
}

export function convert(input: string, name: string) {
    let result = convertImports(input, name);

    return result;
}

export function convertImports(input: string, name: string) {
    const items = [] as { name: string, path: string }[];
    let result = input.replace(/<!-- #include file="(.*)\/(.*?).asp" -->/g, (input, group1, group2) => {
        const path = `${group1}/${group2}`;
        items.push({ name: group2, path: path });
        return `<%\n${group2}();\n%>`;
    });

    result = convertCode(result);
    result = convertExpressions(result);
    result = convertStrings(result);

    result = `\nexport function ${name}() {\n${result}\n}`

    for (const item of items) {
        result = `import {${item.name}} from "${item.path}"\n${result}`;
    }

    return result;
}

export function convertCode(input: string) {
    const result = input.replace(/<%([^=][\s\S]*?)%>/g, (input, group1) => {
        let code = group1;
        code = convertComments(code);
        code = convertIfStatements(code);
        code = convertSwitchStatements(code);
        code = convertFunctions(code);
        code = convertForStatements(code);
        code = convertLoops(code);
        code = convertSplit(code);

        return `<%${code}%>`;
    });

    return result;
}

export function convertExpressions(input: string) {
    const result = input.replace(/<%=([\s\S]*?)%>/g, '${$1}');

    return result;
}

export function convertStrings(input: string) {
    let result = input.replace(/%>([\s\S]+?)<%/g, "\nResponse.Write(`$1`);\n");

    // Entire document is a string
    if (result.indexOf("<%") === -1) {
        result = `Response.Write(\`${result}\`);`;
    }

    // Start of the document is a string
    const firstIndex = result.indexOf("<%");
    if (firstIndex > 0) {
        result = `Response.Write(\`${result.substr(0, firstIndex)}\`);\n${result.substring(firstIndex + 2)}`;
    }

    result = result.replace(/%>$/, "");

    // End of the document is a string
    const lastIndex = result.lastIndexOf("%>");
    if (lastIndex > -1 && lastIndex < result.length - 2) {
        result = `${result.substr(0, lastIndex)}\nResponse.Write(\`${result.substr(lastIndex + 3)}\`);`;
    }

    result = result.replace(/^<%/, "");

    return result;
}

export function convertComments(input: string) {
    let result = '';
    const splitted = input.split(/(".*")/gm);
    for (const part of splitted) {
        if (part.indexOf(`"`) === 0) {
            result += part;
        }
        else {
            result += part.replace(/'/g, "//");
        }
    }

    return result;
}

export function convertIfStatements(input: string) {
    let result = input.replace(/if +(.*?) +then/g, (input, group1) => {
        const condition = convertConditions(group1)
        return `\nif (${condition}) {\n`;
    });
    result = result.replace(/end if/g, "\n}\n");
    result = result.replace(/else(?!{)/g, "\n}\nelse {\n");

    return result;
}

export function convertSwitchStatements(input: string) {
    let result = input.replace(/select case +(.*)/g, "\nswitch ($1) {\n");
    result = result.replace(/end select/g, "\n}\n");

    return result;
}

export function convertFunctions(input: string) {
    let result = input.replace(/function +(.*)\((.*)\)/g, "\n$1 = ($2) => {\n");
    result = result.replace(/end function/g, "\n}\n");

    return result;
}

export function convertForStatements(input: string) {
    let result = input.replace(/for +(.*to.*)/g, "\nfor ($1) {\n");
    result = result.replace(/^ *next *$/gm, "}\n");

    return result;
}

export function convertConditions(input: string) {
    let result = input.replace(/ +and +/g, " && ");
    result = result.replace(/ +or +/g, " || ");
    result = result.replace(/ +<> +/g, " !== ");
    result = result.replace(/ += +/g, " === ");

    return result;
}

export function convertLoops(input: string) {
    let result = input.replace(/do until +(.*)/g, (input, group1) => {
        const condition = convertConditions(group1);
        return `\nwhile (!(${condition})) {\n`;
    });
    result = result.replace(/^ *loop *$/gm, "}\n");

    return result;
}

export function convertSplit(input: string) {
    const result = input.replace(/Split\((.+?),(".+?")\)\s/g, `$1.split($2);`);

    return result;
}