// Translations of everything the dialog shows.
//
// MuseScore cannot load an extension's own Qt translation files, but it sets Qt's default locale
// to its UI language, so the extension picks its strings itself. Keys are the English text, as
// with qsTr, and a missing translation falls back to English. The macros actions run without the
// Qt object and stay in English. tests/i18n.test.js checks that every tr() and trn() text has a
// translation and that no translation is left over.

var TRANSLATIONS = {
    en: {
        "%n bar": ["%n bar", "%n bars"]
    },
    pl: {
        "Bars": "Takty",
        "Start": "Początek",
        "End": "Koniec",
        "Duration": "Czas trwania",
        "From (mm)": "Od (mm)",
        "To (mm)": "Do (mm)",
        "Image on bar %1, in the system of bars %2.": "Obrazek w takcie %1, w systemie taktów %2.",
        "Select the bars or the system to space, then press Make linear. Click an image to align it.":
            "Zaznacz takty albo system i naciśnij Wyrównaj liniowo. Kliknij obrazek, żeby go wyrównać.",
        "Bars %1   %2 to %3   duration %4 s": "Takty %1   %2 do %3   czas %4 s",
        "Keep bars on their line (dense notes, barlines and signatures may overlap)":
            "Zostaw takty na swojej linii (gęste nuty, kreski taktowe i oznaczenia mogą na siebie nachodzić)",
        "Make linear": "Wyrównaj liniowo",
        "How it works": "Jak to działa",
        "Close": "Zamknij",
        "From": "Od",
        "To": "Do",
        "your picture": "twój obrazek",
        "Make linear puts the notes on an even time grid (spacing ratio 2).":
            "Wyrównaj liniowo stawia nuty na równej siatce czasu (proporcja odstępów 2).",
        "From and To in the table are measured from the left page edge.":
            "Od i Do w tabeli liczone są od lewej krawędzi strony.",
        "A line too dense for this gives bars to the next one, unless bars are kept.":
            "Zbyt gęsta linia oddaje takty następnej, chyba że takty mają zostać.",
        "A picture: drag its file onto its first bar, click it, align it.":
            "Obrazek: przeciągnij plik na jego pierwszy takt, kliknij i wyrównaj.",
        "Reset": "Resetuj",
        "Reset all": "Resetuj wszystko",
        "Removed the spacing adjustments from the selection.": "Usunięto zmiany odstępów z zaznaczenia.",
        "Align to whole system (bars %1)": "Wyrównaj do całego systemu (takty %1)",
        "%n bar": ["%n takt", "%n takty", "%n taktów"],
        "Align to bar %1": "Wyrównaj do taktu %1",
        "Align to bars %1": "Wyrównaj do taktów %1",
        "Could not make these bars linear, they are unchanged: %1.":
            "Nie udało się wyrównać liniowo tych taktów, zostały bez zmian: %1.",
        "Done. Every note in the selection is within %1 mm of a linear time grid.":
            "Gotowe. Każda nuta w zaznaczeniu jest najwyżej %1 mm od liniowej siatki czasu.",
        "Could not align the image to bar %1: its staff has no notes there.":
            "Nie udało się wyrównać obrazka do taktu %1: na jego pięciolinii nie ma tam nut.",
        "Could not align the image to bars %1: its staff has no notes there.":
            "Nie udało się wyrównać obrazka do taktów %1: na jego pięciolinii nie ma tam nut.",
        "Image aligned to bar %1: from the first note to the end of its time span, above the staff.":
            "Obrazek wyrównany do taktu %1: od pierwszej nuty do końca jego czasu, nad pięciolinią.",
        "Image aligned to bars %1: from the first note to the end of their time span, above the staff.":
            "Obrazek wyrównany do taktów %1: od pierwszej nuty do końca ich czasu, nad pięciolinią.",
        "Reset the whole score: spacing adjustments removed, spacing ratio and system locks as before.":
            "Zresetowano całą partyturę: zmiany odstępów usunięte, proporcja odstępów i blokady systemów "
            + "jak przedtem.",
        ["Removed all spacing adjustments. The spacing ratio and system locks from before were not recorded "
            + "(spaced by an older version of this extension): reset them in Format > Style and "
            + "Format > Add/remove system locks."]:
            "Usunięto wszystkie zmiany odstępów. Wcześniejsza proporcja odstępów i blokady systemów nie "
            + "zostały zapisane (wyrównano starszą wersją tego rozszerzenia): przywróć je w Format > Styl "
            + "i Format > Dodaj/usuń blokadę systemu."
    }
};

// Which plural form a count takes, as an index into a translation's list of forms.
var PLURAL_FORM = {
    en: function (n) {
        return n === 1 ? 0 : 1;
    },
    pl: function (n) {   // 1 takt, 2-4 takty (but 12-14 taktów), 5 taktów
        if (n === 1) {
            return 0;
        }
        return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2;
    }
};

// The language of MuseScore's UI, as a two-letter code. English where Qt is not around.
function uiLanguage() {
    var name = typeof Qt !== "undefined" && Qt.locale ? Qt.locale().name : "en";
    var code = name.split(/[_-]/)[0];
    return TRANSLATIONS[code] ? code : "en";
}

function fill(text, args) {
    for (var i = 1; i < args.length; i++) {
        text = text.split("%" + i).join(args[i]);
    }
    return text;
}

// The translation of text, with %1, %2 ... replaced by the further arguments.
function tr(text) {
    var translated = TRANSLATIONS[uiLanguage()][text];
    return fill(typeof translated === "string" ? translated : text, arguments);
}

// The translation of a text with a count, %n in it standing for the count, in the right plural form.
function trn(text, n) {
    var language = uiLanguage();
    var forms = TRANSLATIONS[language][text] || TRANSLATIONS.en[text];
    if (!TRANSLATIONS[language][text]) {
        language = "en";
    }
    return forms[PLURAL_FORM[language](n)].split("%n").join(n);
}
