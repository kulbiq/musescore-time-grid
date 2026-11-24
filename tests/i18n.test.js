// Checks the translations in time_grid/src/i18n.js against the texts the code asks for:
// every tr() and trn() text has a translation in every language, none is left over, and the
// placeholders match. Run with: node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "../time_grid");
const i18n = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "src/i18n.js"), "utf8"), i18n);

// Every text passed to tr() or trn() as string literals, joined where they are split with +.
function usedTexts() {
    const files = ["Main.qml", ...fs.readdirSync(path.join(root, "src")).map((f) => "src/" + f)];
    const call = /\btrn?\(\s*((?:"(?:[^"\\]|\\.)*"\s*(?:\+\s*)?)+)/g;
    const texts = new Map();
    for (const file of files.filter((f) => f !== "src/i18n.js")) {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        for (const match of source.matchAll(call)) {
            const text = [...match[1].matchAll(/"(?:[^"\\]|\\.)*"/g)].map((m) => JSON.parse(m[0])).join("");
            texts.set(text, match[0].startsWith("trn") ? "plural" : "plain");
        }
    }
    return texts;
}

function placeholders(text) {
    return [...text.matchAll(/%[0-9n]/g)].map((m) => m[0]).sort().join(" ");
}

test("the code asks for texts", () => {
    assert.ok(usedTexts().size > 20);
});

for (const language of Object.keys(i18n.TRANSLATIONS).filter((l) => l !== "en")) {
    test(`every text has a ${language} translation with the same placeholders`, () => {
        const table = i18n.TRANSLATIONS[language];
        for (const [text, kind] of usedTexts()) {
            const translated = table[text];
            assert.ok(translated !== undefined, `missing ${language}: ${text}`);
            for (const form of kind === "plural" ? translated : [translated]) {
                assert.strictEqual(placeholders(form), placeholders(text), `${language}: ${text}`);
            }
        }
    });

    test(`no ${language} translation is left over`, () => {
        const used = usedTexts();
        for (const text of Object.keys(i18n.TRANSLATIONS[language])) {
            assert.ok(used.has(text), `unused ${language}: ${text}`);
        }
    });
}

test("plural texts have their English forms", () => {
    for (const [text, kind] of usedTexts()) {
        if (kind === "plural") {
            assert.strictEqual(i18n.TRANSLATIONS.en[text].length, 2, text);
        }
    }
});

test("English is used without Qt, with the placeholders filled in", () => {
    assert.strictEqual(i18n.tr("Align to bars %1", "3-5"), "Align to bars 3-5");
    assert.strictEqual(i18n.trn("%n bar", 1), "1 bar");
    assert.strictEqual(i18n.trn("%n bar", 2), "2 bars");
});

test("Polish follows MuseScore's UI language and its plural rules", () => {
    const pl = vm.createContext({ Qt: { locale: () => ({ name: "pl_PL" }) } });
    vm.runInContext(fs.readFileSync(path.join(root, "src/i18n.js"), "utf8"), pl);
    assert.strictEqual(pl.tr("Align to bars %1", "3-5"), "Wyrównaj do taktów 3-5");
    const forms = [1, 2, 4, 5, 11, 12, 14, 22, 25].map((n) => pl.trn("%n bar", n));
    assert.deepStrictEqual(forms, ["1 takt", "2 takty", "4 takty", "5 taktów", "11 taktów", "12 taktów",
                                   "14 taktów", "22 takty", "25 taktów"]);
    const fr = vm.createContext({ Qt: { locale: () => ({ name: "fr_FR" }) } });
    vm.runInContext(fs.readFileSync(path.join(root, "src/i18n.js"), "utf8"), fr);
    assert.strictEqual(fr.tr("Make linear"), "Make linear");   // no French yet: English
});
