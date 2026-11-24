import QtQuick

import MuseApi.Controls

import "core.js" as Core   // built by install.sh from src/*.js

ExtensionBlank {
    id: root

    implicitWidth: 620
    implicitHeight: 420

    color: api.theme.backgroundPrimaryColor

    property var range: null      // { t0, t1 } of the selection, snapped to whole bars
    property var rows: []         // one entry per selected system, see Core.describe
    property string status: ""
    property bool keepBars: false   // false: bars of a too dense system move to the next line

    readonly property var columns: [
        { title: "Bars", width: 76 },
        { title: "Start", width: 92 },
        { title: "End", width: 92 },
        { title: "Duration", width: 92 },
        { title: "From (mm)", width: 92 },
        { title: "To (mm)", width: 92 }
    ]

    function clock(sec) {
        var m = Math.floor(sec / 60);
        var s = (sec - m * 60).toFixed(3);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function cells(r) {
        return [
            Core.barsLabel(r.firstBar, r.lastBar),
            clock(r.start), clock(r.end), r.duration.toFixed(3) + " s",
            r.x0Mm.toFixed(1), r.x1Mm.toFixed(1)
        ];
    }

    function refresh(force) {
        var next = Core.selectedRange(api.engraving);
        var same = (!next && !range) || (next && range && next.t0 === range.t0 && next.t1 === range.t1);
        if (same && !force) {
            return;
        }
        range = next;
        rows = next ? Core.describe(api.engraving, next) : [];
    }

    function summary() {
        if (!rows.length) {
            return "Select the bars or the system to space, then press Make linear.";
        }
        var a = rows[0], b = rows[rows.length - 1];
        return "Bars " + Core.barsLabel(a.firstBar, b.lastBar) + "   " + clock(a.start) + " to " + clock(b.end)
                + "   duration " + (b.end - a.start).toFixed(3) + " s";
    }

    // ponytail: polls the selection, the form API has no selection-changed signal.
    // Only the selection range is read per tick, the table is rebuilt when it changes.
    Timer {
        interval: 300
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh(false)
    }

    Column {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        StyledTextLabel {
            width: parent.width
            horizontalAlignment: Text.AlignLeft
            font.bold: true
            text: root.summary()
        }

        Row {
            id: header
            visible: root.rows.length > 0
            Repeater {
                model: root.columns
                StyledTextLabel {
                    width: modelData.width
                    horizontalAlignment: Text.AlignLeft
                    opacity: 0.7
                    text: modelData.title
                }
            }
        }

        ListView {
            width: parent.width
            height: parent.height - y - footer.height - parent.spacing
            clip: true
            model: root.rows
            delegate: Row {
                height: 24
                property var values: root.cells(modelData)
                Repeater {
                    model: root.columns
                    StyledTextLabel {
                        width: modelData.width
                        height: 24
                        horizontalAlignment: Text.AlignLeft
                        text: values[index]
                    }
                }
            }
        }

        Column {
            id: footer
            width: parent.width
            spacing: 12

            StyledTextLabel {
                width: parent.width
                horizontalAlignment: Text.AlignLeft
                wrapMode: Text.WordWrap
                opacity: 0.7
                text: root.status !== "" ? root.status
                    : "One row per system. From and To are measured from the left page edge: "
                      + "the first note of the row and the point where its time span ends. "
                      + "Make linear sets the score's spacing ratio style to 2. Unless bars are kept on their line, "
                      + "bars of a system that is too dense move to the next line."
            }

            // Hand-drawn: MuseApi.Controls' CheckBox fails to load in MuseScore 4.7.7
            // ("NavigationFocusBorder is not a type"), which blanks the whole dialog.
            Row {
                spacing: 8
                height: 20

                Rectangle {
                    width: 20
                    height: 20
                    radius: 3
                    color: root.keepBars ? api.theme.accentColor : "transparent"
                    border.width: 1
                    border.color: root.keepBars ? api.theme.accentColor : api.theme.fontPrimaryColor

                    StyledTextLabel {
                        anchors.centerIn: parent
                        visible: root.keepBars
                        font.bold: true
                        text: "\u2713"
                    }
                }

                StyledTextLabel {
                    height: 20
                    horizontalAlignment: Text.AlignLeft
                    text: "Keep bars on their line (very dense notes may overlap)"
                }

                TapHandler {
                    onTapped: root.keepBars = !root.keepBars
                }
            }

            Row {
                spacing: 12

                FlatButton {
                    text: "Make linear"
                    accentButton: true
                    enabled: root.range !== null
                    onClicked: {
                        var res = Core.linearize(api.engraving, root.range, { keepBars: root.keepBars });
                        root.refresh(true);
                        root.status = Core.resultMessage(api.engraving, res);
                    }
                }

                FlatButton {
                    text: "Reset"
                    enabled: root.range !== null
                    onClicked: {
                        Core.reset(api.engraving, root.range);
                        root.refresh(true);
                        root.status = "Removed the spacing adjustments from the selection.";
                    }
                }
            }
        }
    }
}
