package com.pentaworks.intranet.content;

import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.NodeTraversor;
import org.jsoup.select.NodeVisitor;

final class WorkshopRepairText {
    private static final Pattern HTML_TAG = Pattern.compile(
        "<(?:a|article|b|blockquote|br|code|div|em|figcaption|figure|font|h[1-6]|hr|img|li|ol|p|pre|section|span|strong|table|tbody|td|th|tr|u|ul)(?=[\\s/>])",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern DRIVER_MODULE = Pattern.compile(
        "드라이버\\s*모듈\\s*(?:[①②]|1\\s*[,·]\\s*2|#?\\s*[12](?:\\s*번)?|\\(\\s*[12](?:\\s*번)?\\s*\\))?",
        Pattern.UNICODE_CHARACTER_CLASS);

    private WorkshopRepairText() {}

    static String equipmentName(String name) {
        return DRIVER_MODULE.matcher(name.strip()).matches() ? "드라이버모듈" : name;
    }

    static String plain(String value) {
        if (value == null || !HTML_TAG.matcher(value).find()) return value;

        var body = Jsoup.parseBodyFragment(value).body();
        body.select("script, style, template").remove();
        var text = new StringBuilder();
        NodeTraversor.traverse(new NodeVisitor() {
            private boolean preformatted;

            @Override
            public void head(Node node, int depth) {
                if (node instanceof TextNode content) {
                    String part = content.getWholeText().replace('\u00a0', ' ');
                    if (preformatted) {
                        text.append(part);
                    } else {
                        part = part.replaceAll("[\\s\\p{Zs}]+", " ");
                        if (text.isEmpty() || Character.isWhitespace(text.charAt(text.length() - 1))) part = part.stripLeading();
                        text.append(part);
                    }
                    return;
                }
                if (!(node instanceof Element element)) return;
                switch (element.normalName()) {
                    case "br" -> text.append('\n');
                    case "li" -> {
                        lineBreak();
                        text.append(element.parent() != null && element.parent().normalName().equals("ol")
                            ? (element.elementSiblingIndex() + 1) + ". " : "• ");
                    }
                    case "td", "th" -> {
                        if (element.previousElementSibling() != null) text.append(" | ");
                    }
                    case "img" -> {
                        lineBreak();
                        String alt = element.attr("alt").strip();
                        text.append(alt.isEmpty() ? "[사진]" : "[사진: " + alt + "]");
                        appendLink(element.attr("src"));
                        lineBreak();
                    }
                    case "pre" -> {
                        lineBreak();
                        preformatted = true;
                    }
                    default -> {
                        if (element.isBlock()) lineBreak();
                    }
                }
            }

            @Override
            public void tail(Node node, int depth) {
                if (!(node instanceof Element element)) return;
                switch (element.normalName()) {
                    case "pre" -> {
                        preformatted = false;
                        lineBreak();
                    }
                    case "a" -> {
                        String href = element.attr("href").strip();
                        if (!href.equals(element.text())) appendLink(href);
                    }
                    case "td", "th" -> { }
                    default -> {
                        if (element.isBlock()) lineBreak();
                    }
                }
            }

            private void appendLink(String url) {
                String target = url.strip();
                if (target.startsWith("/") || target.startsWith("https://") || target.startsWith("http://")) {
                    text.append(" (").append(target).append(')');
                }
            }

            private void lineBreak() {
                if (!text.isEmpty() && text.charAt(text.length() - 1) != '\n') text.append('\n');
            }
        }, body);
        return text.toString().replaceAll("[ \\t]+\\n", "\n").strip();
    }
}
