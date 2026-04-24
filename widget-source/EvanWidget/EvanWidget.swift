import WidgetKit
import SwiftUI

// Requires iOS 17+ for containerBackground API

// MARK: - Timeline Entry

struct EvanEntry: TimelineEntry {
    let date: Date
    let itemName: String
    let price: String
    let profit: String
}

// MARK: - Provider

struct EvanProvider: TimelineProvider {
    func placeholder(in context: Context) -> EvanEntry {
        EvanEntry(date: Date(), itemName: "Jordan 1 Retro High OG", price: "$280", profit: "+$120")
    }

    func getSnapshot(in context: Context, completion: @escaping (EvanEntry) -> Void) {
        let entry = loadEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EvanEntry>) -> Void) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> EvanEntry {
        let defaults = UserDefaults(suiteName: "group.com.evanbyon.evanai.widget")
        let itemName = defaults?.string(forKey: "widgetItemName") ?? "Last Scan"
        let price    = defaults?.string(forKey: "widgetPrice")    ?? "—"
        let profit   = defaults?.string(forKey: "widgetProfit")   ?? "—"
        return EvanEntry(date: Date(), itemName: itemName, price: price, profit: profit)
    }
}

// MARK: - Widget View

struct EvanWidgetEntryView: View {
    var entry: EvanEntry

    var body: some View {
        ZStack {
            Color.black
            VStack(alignment: .leading, spacing: 4) {
                Text("EVAN AI")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(.orange)
                    .tracking(2)
                Spacer()
                Text(entry.itemName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 8) {
                    Text(entry.price)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                    Text(entry.profit)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(entry.profit.hasPrefix("+") ? .green : .red)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .containerBackground(Color.black, for: .widget)
    }
}

// MARK: - Widget Configuration

@main
struct EvanWidget: Widget {
    let kind: String = "EvanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: EvanProvider()) { entry in
            EvanWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Evan AI")
        .description("See your latest scan result at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
