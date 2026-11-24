import QtQuick

import MuseApi.Controls

import "core.js" as Core   // built by install.sh from src/*.js

ExtensionBlank {
    id: root

    implicitWidth: 620
    implicitHeight: 480

    color: api.theme.backgroundPrimaryColor

    property var range: null      // { t0, t1 } of the selection, snapped to whole bars
    property var rows: []         // one entry per selected system, see Core.describe
    property var image: null      // the selected image, see Core.selectedImage
    property int barCount: 1      // how many bars from its anchor bar the image should span
    property string status: ""
    property bool keepBars: false   // false: bars of a too dense system move to the next line
    property bool helpShown: false

    readonly property var columns: [
        { title: Core.tr("Bars"), width: 76 },
        { title: Core.tr("Start"), width: 92 },
        { title: Core.tr("End"), width: 92 },
        { title: Core.tr("Duration"), width: 92 },
        { title: Core.tr("From (mm)"), width: 92 },
        { title: Core.tr("To (mm)"), width: 92 }
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
        var nextImage = Core.selectedImage(api.engraving);
        var sameImage = (!nextImage && !image) || (nextImage && image && nextImage.image.is(image.image));
        if (!sameImage) {
            barCount = 1;
        }
        if (!sameImage || force || (nextImage && (nextImage.bar !== image.bar
                || nextImage.firstBar !== image.firstBar || nextImage.lastBar !== image.lastBar))) {
            image = nextImage;
        }

        var next = Core.selectedRange(api.engraving);
        var same = (!next && !range) || (next && range && next.t0 === range.t0 && next.t1 === range.t1);
        if (same && !force) {
            return;
        }
        range = next;
        rows = next ? Core.describe(api.engraving, next) : [];
    }

    // the bars of the "N bars" button: from the anchor bar, cut off where the system ends
    function lastOfCount() {
        return Math.min(image.bar + barCount - 1, image.lastBar);
    }

    function alignSelected(count) {
        var res = Core.alignImage(api.engraving, image.image, count);
        refresh(true);
        status = Core.alignMessage(res);
    }

    function summary() {
        if (image) {
            return Core.tr("Image on bar %1, in the system of bars %2.", image.bar,
                           Core.barsLabel(image.firstBar, image.lastBar));
        }
        if (!rows.length) {
            return Core.tr("Select the bars or the system to space, then press Make linear. Click an image to align it.");
        }
        var a = rows[0], b = rows[rows.length - 1];
        return Core.tr("Bars %1   %2 to %3   duration %4 s", Core.barsLabel(a.firstBar, b.lastBar),
                       clock(a.start), clock(b.end), (b.end - a.start).toFixed(3));
    }

    // ponytail: polls the selection, the form API has no selection-changed signal.
    // Only the selection is read per tick, the table is rebuilt when it changes.
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

        Item {
            width: parent.width
            height: Math.max(summaryLabel.height, helpButton.height)

            StyledTextLabel {
                id: summaryLabel
                width: parent.width - helpButton.width - 12
                horizontalAlignment: Text.AlignLeft
                wrapMode: Text.WordWrap
                font.bold: true
                text: root.summary()
            }

            FlatButton {
                id: helpButton
                anchors.right: parent.right
                width: 30
                text: "?"
                onClicked: root.helpShown = true
            }
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
                visible: root.status !== ""
                horizontalAlignment: Text.AlignLeft
                wrapMode: Text.WordWrap
                opacity: 0.7
                text: root.status
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
                    text: Core.tr("Keep bars on their line (dense notes, barlines and signatures may overlap)")
                }

                TapHandler {
                    onTapped: root.keepBars = !root.keepBars
                }
            }

            Row {
                spacing: 12

                FlatButton {
                    text: Core.tr("Make linear")
                    accentButton: true
                    enabled: root.range !== null
                    onClicked: {
                        var res = Core.linearize(api.engraving, root.range, { keepBars: root.keepBars });
                        root.refresh(true);
                        root.status = Core.resultMessage(api.engraving, res);
                    }
                }

                FlatButton {
                    text: Core.tr("Reset")
                    enabled: root.range !== null
                    onClicked: {
                        Core.reset(api.engraving, root.range);
                        root.refresh(true);
                        root.status = Core.tr("Removed the spacing adjustments from the selection.");
                    }
                }

                FlatButton {
                    text: Core.tr("Reset all")
                    enabled: api.engraving.curScore !== null
                    onClicked: {
                        var res = Core.resetAll(api.engraving);
                        root.refresh(true);
                        root.status = Core.resetAllMessage(res);
                    }
                }
            }

            // shown while an image is selected: align it to its whole system, or to a number of bars
            // from its anchor bar
            Column {
                spacing: 8
                visible: root.image !== null

                FlatButton {
                    text: root.image ? Core.tr("Align to whole system (bars %1)",
                                               Core.barsLabel(root.image.firstBar, root.image.lastBar)) : ""
                    accentButton: true
                    onClicked: root.alignSelected(0)
                }

                Row {
                    spacing: 8

                    FlatButton {
                        text: "\u2212"
                        enabled: root.barCount > 1
                        onClicked: root.barCount--
                    }

                    StyledTextLabel {
                        width: 76
                        height: 30
                        verticalAlignment: Text.AlignVCenter
                        text: Core.trn("%n bar", root.barCount)
                    }

                    FlatButton {
                        text: "+"
                        enabled: root.image !== null && root.image.bar + root.barCount - 1 < root.image.lastBar
                        onClicked: root.barCount++
                    }

                    FlatButton {
                        text: !root.image ? ""
                            : root.barCount === 1 ? Core.tr("Align to bar %1", root.image.bar)
                            : Core.tr("Align to bars %1", Core.barsLabel(root.image.bar, root.lastOfCount()))
                        onClicked: root.alignSelected(root.barCount)
                    }
                }
            }
        }
    }

    // Help, over the dialog: a figure of two bars spaced by this extension, with a picture aligned
    // above them (tools/make_figure.py), and what the dialog does in a few lines.
    Rectangle {
        anchors.fill: parent
        visible: root.helpShown
        color: Qt.rgba(0, 0, 0, 0.45)

        MouseArea {
            anchors.fill: parent
            onClicked: root.helpShown = false
        }

        Rectangle {
            id: card
            anchors.centerIn: parent
            width: parent.width - 24
            height: content.height + 32
            radius: 6
            color: api.theme.backgroundPrimaryColor
            border.width: 1
            border.color: Qt.rgba(api.theme.fontPrimaryColor.r, api.theme.fontPrimaryColor.g,
                                  api.theme.fontPrimaryColor.b, 0.25)

            MouseArea {   // keeps clicks on the card from closing it
                anchors.fill: parent
            }

            Column {
                id: content
                x: 16
                y: 16
                width: parent.width - 32
                spacing: 12

                Item {
                    width: parent.width
                    height: closeButton.height

                    StyledTextLabel {
                        anchors.verticalCenter: parent.verticalCenter
                        font.bold: true
                        text: Core.tr("How it works")
                    }

                    FlatButton {
                        id: closeButton
                        anchors.right: parent.right
                        text: Core.tr("Close")
                        onClicked: root.helpShown = false
                    }
                }

                // the figure on white, as the score shows in MuseScore, with the time grid drawn over it
                Rectangle {
                    width: parent.width
                    height: figure.height + 2 * figure.y
                    radius: 4
                    color: "white"

                    Image {
                        id: figure
                        x: 8
                        y: 8
                        width: parent.width - 2 * x
                        height: width * Core.FIGURE.height / Core.FIGURE.width
                        source: "figure.png"
                        smooth: true
                        mipmap: true

                        function fx(f) { return f * width; }
                        function fy(f) { return f * height; }
                        function beatX(i) {
                            var f = Core.FIGURE;
                            return fx(f.from + (f.to - f.from) * i / f.beats);
                        }

                        Repeater {
                            model: Core.FIGURE.beats + 1
                            Rectangle {
                                readonly property bool edge: index === 0 || index === Core.FIGURE.beats
                                x: Math.round(figure.beatX(index) - width / 2)
                                y: Math.round(figure.fy(Core.FIGURE.pictureTop)) - 4
                                width: edge ? 2 : 1
                                height: Math.round(figure.fy(Core.FIGURE.staffBottom)) + 4 - y
                                color: api.theme.accentColor
                                opacity: edge ? 1 : 0.45
                            }
                        }

                        Text {
                            x: Math.round(figure.beatX(0) - width / 2)
                            y: Math.round(figure.fy(Core.FIGURE.staffBottom)) + 6
                            color: api.theme.accentColor
                            font.bold: true
                            text: Core.tr("From")
                        }

                        Text {
                            x: Math.round(figure.beatX(Core.FIGURE.beats)) - width
                            y: Math.round(figure.fy(Core.FIGURE.staffBottom)) + 6
                            color: api.theme.accentColor
                            font.bold: true
                            text: Core.tr("To")
                        }
                    }
                }

                Repeater {
                    model: [
                        Core.tr("Make linear puts every note of the selected bars on an even time grid (the thin lines, one "
                                + "per beat): a note twice as long gets twice the room. It also sets the score's spacing "
                                + "ratio style to 2, Reset all puts it back."),
                        Core.tr("From and To, also in the table: a line's first note and the point where its time ends, "
                                + "measured from the left page edge."),
                        Core.tr("When a line is too dense for this, its last bars move to the next line, unless bars are "
                                + "kept on their line."),
                        Core.tr("To add a picture, drag its file onto the bar it should start at, click it and align it: "
                                + "it then spans From to To, above the staff.")
                    ]

                    Row {
                        width: parent.width
                        spacing: 4

                        StyledTextLabel {
                            width: 16
                            horizontalAlignment: Text.AlignLeft
                            text: (index + 1) + "."
                        }

                        StyledTextLabel {
                            width: parent.width - 20
                            horizontalAlignment: Text.AlignLeft
                            wrapMode: Text.WordWrap
                            text: modelData
                        }
                    }
                }
            }
        }
    }
}
