// AI Builder Screening Agent — native macOS shell.
//
// Thin SwiftUI front-end over the Node orchestrator. It shells out to the engine
// (`src/cli.ts --json`) exactly like Radar.app drives career-ops, decodes the
// result, and renders a sortable / filterable results table. The human makes the
// advance/reject decision here — the AI only ranks and explains.

import AppKit
import SwiftUI

// MARK: - Engine location

enum Engine {
    // The repo this app drives. For the prototype the path is fixed; a shipping
    // build would resolve it relative to the bundle or a settings pane.
    static let projectDir = "/Users/zee/projects/KPMG SCREENING AGENT"
    static let defaultJD = projectDir + "/fixtures/jd-a-ai-builder.txt"
    static let defaultJDb = projectDir + "/fixtures/jd-b-aml-analyst.txt"
    static let defaultProfiles = projectDir + "/fixtures/profiles"
}

// MARK: - Models (decode the CLI's --json output verbatim)

struct DimScore: Codable, Identifiable {
    let dimension: String
    let score: Int
    let evidence: [String]
    let anchor: String
    let justification: String
    let note: String
    var id: String { dimension }
}

struct CandidateResult: Codable, Identifiable {
    let candidateId: String
    let name: String
    let email: String
    let phone: String
    let status: String
    let total: Double?
    let dimScores: [DimScore]
    let summary: String?
    let reason: String

    var id: String { candidateId }
    var sortScore: Double { total ?? -1 }
    var scoreText: String { total == nil ? "—" : String(format: "%.1f", total!) }
}

struct JDSpec: Codable { let title: String }

struct EngineError: Error { let message: String }

struct RunOutput: Codable {
    let spec: JDSpec
    let threshold: Double
    let results: [CandidateResult]
}

// MARK: - State

@MainActor
final class AppState: ObservableObject {
    @Published var jdPath = Engine.defaultJD
    @Published var profilesDir = Engine.defaultProfiles
    @Published var threshold = 6.0
    @Published var output: RunOutput?
    @Published var running = false
    @Published var errorMsg: String?
    @Published var search = ""
    @Published var hrEmail = ""
    @Published var autoEmail = false
    @Published var emailStatus: String?
    @Published var advanced = Set<String>()
    @Published var sortOrder = [KeyPathComparator(\CandidateResult.sortScore, order: .reverse)]

    var rows: [CandidateResult] {
        let all = output?.results ?? []
        let filtered = search.isEmpty
            ? all
            : all.filter {
                $0.name.localizedCaseInsensitiveContains(search)
                    || ($0.summary ?? "").localizedCaseInsensitiveContains(search)
                    || $0.reason.localizedCaseInsensitiveContains(search)
            }
        return filtered.sorted(using: sortOrder)
    }

    func run() {
        running = true
        errorMsg = nil
        let jd = jdPath, profiles = profilesDir, thr = Int(threshold)
        Task.detached {
            let result = Self.invoke(jd: jd, profiles: profiles, threshold: thr)
            await MainActor.run {
                self.running = false
                switch result {
                case .success(let out):
                    self.output = out
                    self.advanced.removeAll()
                    if self.autoEmail { self.emailShortlist(out.results) }
                case .failure(let e):
                    self.errorMsg = e.message
                }
            }
        }
    }

    nonisolated static func invoke(jd: String, profiles: String, threshold: Int) -> Result<RunOutput, EngineError> {
        let cmd = """
        cd \(shq(Engine.projectDir)) && LLM_CACHE_DIR=.cache/llm \
        node --experimental-sqlite --no-warnings --import tsx src/cli.ts \
        --jd \(shq(jd)) --profiles \(shq(profiles)) --threshold \(threshold) --db ledger.db --json
        """
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", cmd]
        let outPipe = Pipe(), errPipe = Pipe()
        proc.standardOutput = outPipe
        proc.standardError = errPipe
        do { try proc.run() } catch { return .failure(EngineError(message: "Failed to launch engine: \(error)")) }
        let outData = outPipe.fileHandleForReading.readDataToEndOfFile()
        let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        if let out = try? JSONDecoder().decode(RunOutput.self, from: outData) {
            return .success(out)
        }
        let err = String(data: errData, encoding: .utf8) ?? ""
        return .failure(EngineError(message: "Engine produced no parseable result.\n\(err.suffix(600))"))
    }

    /// Email this candidate's summary + full detail to the HR address. The click
    /// is the authorization; this sends silently via the user's Mail account.
    func emailCandidate(_ r: CandidateResult) {
        let addr = hrEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !addr.isEmpty else { emailStatus = "⚠︎ Enter the HR email address first."; return }
        guard addr.contains("@") else { emailStatus = "⚠︎ That doesn't look like an email address."; return }
        let detail = Self.buildDetail(r, profilesDir: profilesDir)
        let subject = "Candidate review: \(r.name) — \(r.scoreText)/10"
        let body = "Screening result for \(r.name) (\(r.email)).\n\nSummary:\n\(r.summary ?? r.reason)\n\nFull scorecard and materials attached."
        emailStatus = "Sending \(r.name) to \(addr)…"
        Task.detached {
            let result = Self.sendMail(to: addr, subject: subject, body: body, detail: detail, id: r.candidateId)
            await MainActor.run { self.emailStatus = result }
        }
    }

    /// Auto-email every above-threshold ("scored") candidate to HR. Triggered on
    /// run completion when Auto-email is on. Sends sequentially (Mail is slow).
    func emailShortlist(_ results: [CandidateResult]) {
        let addr = hrEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !addr.isEmpty, addr.contains("@") else {
            emailStatus = "⚠︎ Auto-email skipped: set a valid HR email."
            return
        }
        let shortlist = results.filter { $0.status == "scored" }
        guard !shortlist.isEmpty else {
            emailStatus = "No candidates above the line — nothing to auto-email."
            return
        }
        let dir = profilesDir
        emailStatus = "Auto-emailing \(shortlist.count) shortlisted to \(addr)…"
        Task.detached {
            var sent = 0, failed = 0
            for r in shortlist {
                let detail = Self.buildDetail(r, profilesDir: dir)
                let subject = "Candidate review: \(r.name) — \(r.scoreText)/10"
                let body = "Screening result for \(r.name) (\(r.email)).\n\nSummary:\n\(r.summary ?? r.reason)\n\nFull scorecard and materials attached."
                let res = Self.sendMail(to: addr, subject: subject, body: body, detail: detail, id: r.candidateId)
                if res.hasPrefix("✓") { sent += 1 } else { failed += 1 }
            }
            let s = sent, f = failed
            await MainActor.run {
                self.emailStatus = "✓ Auto-emailed \(s) shortlisted candidate\(s == 1 ? "" : "s") to \(addr)" + (f > 0 ? " · \(f) failed" : "")
            }
        }
    }

    nonisolated static func buildDetail(_ r: CandidateResult, profilesDir: String) -> String {
        let folder = profilesDir + "/" + r.candidateId
        func read(_ names: [String]) -> String {
            for n in names {
                if let t = try? String(contentsOfFile: folder + "/" + n, encoding: .utf8) { return t }
            }
            return "(not found)"
        }
        var s = "# Candidate Review — \(r.name)\n\n"
        s += "Contact: \(r.email) · \(r.phone)\n"
        s += "Status: \(r.status)\n"
        if let t = r.total { s += "Total score: \(String(format: "%.1f", t)) / 10\n" }
        s += "\n## Summary\n" + (r.summary ?? r.reason) + "\n"
        if !r.dimScores.isEmpty {
            s += "\n## Dimension scores\n"
            for d in r.dimScores {
                s += "- \(d.dimension): \(d.score)/10 — \(d.justification)\n"
                if let q = d.evidence.first { s += "    evidence: \"\(q)\"\n" }
            }
        }
        s += "\n## Resume\n" + read(["resume.txt", "resume.md"]) + "\n"
        s += "\n## Projects\n" + read(["projects.txt", "projects.md"]) + "\n"
        return s
    }

    /// Send via Mail.app using AppleScript (uses the user's configured account,
    /// attaches the detail file, sends without showing a compose window).
    nonisolated static func sendMail(to: String, subject: String, body: String, detail: String, id: String) -> String {
        let dir = NSTemporaryDirectory()
        let filePath = dir + "Candidate_\(id).md"
        let scriptPath = dir + "send-candidate-mail.scpt"
        do {
            try detail.write(toFile: filePath, atomically: true, encoding: .utf8)
            try APPLESCRIPT.write(toFile: scriptPath, atomically: true, encoding: .utf8)
        } catch {
            return "✗ Could not write attachment: \(error.localizedDescription)"
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        p.arguments = [scriptPath, subject, body, to, filePath]
        let errPipe = Pipe()
        p.standardError = errPipe
        do { try p.run() } catch { return "✗ Could not launch Mail: \(error.localizedDescription)" }
        let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        if p.terminationStatus == 0 { return "✓ Sent \(id) to \(to)" }
        let msg = (String(data: errData, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return "✗ Send failed: \(msg.suffix(200))"
    }
}

/// AppleScript that reads (subject, body, address, attachmentPath) from argv,
/// builds an outgoing Mail message with the attachment, and sends it.
private let APPLESCRIPT = """
on run argv
  set theSubject to item 1 of argv
  set theBody to item 2 of argv
  set theAddr to item 3 of argv
  set theFile to item 4 of argv
  tell application "Mail"
    set newMessage to make new outgoing message with properties {subject:theSubject, content:theBody, visible:false}
    tell newMessage
      make new to recipient with properties {address:theAddr}
      make new attachment with properties {file name:(POSIX file theFile)} at after the last paragraph
    end tell
    delay 1
    send newMessage
  end tell
end run
"""

/// Single-quote shell escaping so paths with spaces ("KPMG SCREENING AGENT") survive.
func shq(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }

// MARK: - Views

struct ContentView: View {
    @StateObject private var state = AppState()
    @State private var detail: CandidateResult?

    var body: some View {
        VStack(spacing: 0) {
            controlBar
            Divider()
            if let err = state.errorMsg {
                ScrollView { Text(err).font(.system(.callout, design: .monospaced)).foregroundStyle(.red).padding() }
            } else if state.output == nil {
                placeholder
            } else {
                resultsTable
            }
        }
        .frame(minWidth: 940, minHeight: 560)
        .sheet(item: $detail) { ProfileSheet(result: $0, profilesDir: state.profilesDir) }
    }

    private var controlBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Job description").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Text(URL(fileURLWithPath: state.jdPath).lastPathComponent).lineLimit(1)
                    Button("Choose…") { pickFile { state.jdPath = $0 } }
                    Menu("Sample") {
                        Button("AI Builder (JD-A)") { state.jdPath = Engine.defaultJD }
                        Button("AML Analyst (JD-B)") { state.jdPath = Engine.defaultJDb }
                    }.frame(width: 90)
                }
            }
            Divider().frame(height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("Candidate folders").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Text(URL(fileURLWithPath: state.profilesDir).lastPathComponent).lineLimit(1)
                    Button("Choose…") { pickDir { state.profilesDir = $0 } }
                }
            }
            Divider().frame(height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("Min score: \(Int(state.threshold))").font(.caption).foregroundStyle(.secondary)
                Slider(value: $state.threshold, in: 0...10, step: 1).frame(width: 120)
            }
            Divider().frame(height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("HR email").font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    TextField("hr@example.com", text: $state.hrEmail).frame(width: 180).textFieldStyle(.roundedBorder)
                    Toggle("Auto-email shortlist on finish", isOn: $state.autoEmail).toggleStyle(.checkbox)
                }
            }
            Spacer()
            Button(action: { state.run() }) {
                HStack { if state.running { ProgressView().controlSize(.small) }; Text(state.running ? "Running…" : "Run") }
                    .frame(width: 90)
            }
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(state.running)
            .buttonStyle(.borderedProminent)
        }
        .padding(12)
    }

    private var placeholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "person.crop.rectangle.stack").font(.system(size: 40)).foregroundStyle(.secondary)
            Text("Pick a JD and a folder of candidates, then Run.").foregroundStyle(.secondary)
            Text("AI ranks and explains. You decide who advances.").font(.caption).foregroundStyle(.tertiary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var resultsTable: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                HStack {
                    Text(state.output!.spec.title).font(.headline)
                    Text("· threshold \(Int(state.output!.threshold))/10").foregroundStyle(.secondary)
                    Spacer()
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Filter", text: $state.search).frame(width: 180).textFieldStyle(.roundedBorder)
                }
                if let st = state.emailStatus {
                    HStack {
                        Spacer()
                        Text(st).font(.caption)
                            .foregroundStyle(st.hasPrefix("✓") ? .green : (st.hasPrefix("Sending") ? .secondary : .red))
                    }
                }
            }.padding(.horizontal, 12).padding(.vertical, 8)

            Table(state.rows, sortOrder: $state.sortOrder) {
                TableColumn("Candidate", value: \.name) { r in Text(r.name).fontWeight(.medium) }.width(min: 120, ideal: 140)
                TableColumn("Score", value: \.sortScore) { r in ScoreBadge(r: r) }.width(60)
                TableColumn("Status", value: \.status) { r in StatusBadge(status: r.status) }.width(120)
                TableColumn("Summary / reason") { r in Text(r.summary ?? r.reason).lineLimit(2).foregroundStyle(r.summary == nil ? .secondary : .primary) }
                TableColumn("Decision") { r in
                    HStack(spacing: 6) {
                        Button("View") { detail = r }
                        if r.status == "scored" || r.status == "below_threshold" {
                            Button("Email") { state.emailCandidate(r) }
                                .disabled(state.hrEmail.isEmpty)
                                .help("Email this candidate's summary + detail to the HR address")
                        }
                        if r.status == "scored" {
                            Button(state.advanced.contains(r.id) ? "✓ Advanced" : "Advance") { toggle(r) }
                                .tint(state.advanced.contains(r.id) ? .green : nil)
                        }
                    }
                }.width(min: 240, ideal: 280)
            }
        }
    }

    private func toggle(_ r: CandidateResult) {
        if state.advanced.contains(r.id) { state.advanced.remove(r.id) } else { state.advanced.insert(r.id) }
    }
}

struct ScoreBadge: View {
    let r: CandidateResult
    private var color: Color {
        if r.total == nil { return .gray }
        return r.status == "scored" ? .green : .primary
    }
    var body: some View {
        Text(r.scoreText).fontWeight(.semibold).monospacedDigit().foregroundStyle(color)
    }
}

struct StatusBadge: View {
    let status: String
    var label: String {
        switch status {
        case "scored": return "Shortlisted"
        case "below_threshold": return "Below line"
        case "filtered_dup": return "Duplicate"
        case "error": return "Error"
        default: return status
        }
    }
    var color: Color {
        switch status {
        case "scored": return .green
        case "below_threshold": return .gray
        case "filtered_dup": return .orange
        case "error": return .red
        default: return .gray
        }
    }
    var body: some View {
        Text(label).font(.caption).padding(.horizontal, 8).padding(.vertical, 2)
            .background(color.opacity(0.15)).foregroundStyle(color).clipShape(Capsule())
    }
}

// MARK: - Profile detail sheet

struct ProfileSheet: View {
    let result: CandidateResult
    let profilesDir: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading) {
                    Text(result.name).font(.title2).bold()
                    Text(contact()).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if let t = result.total { Text(String(format: "%.1f / 10", t)).font(.title3).monospacedDigit() }
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }.padding()
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !result.dimScores.isEmpty {
                        section("Dimension scores") {
                            ForEach(result.dimScores) { d in
                                HStack(alignment: .top) {
                                    Text(d.dimension).frame(width: 110, alignment: .leading).font(.callout.monospaced())
                                    Text("\(d.score)/10").frame(width: 46, alignment: .leading).bold().monospacedDigit()
                                        .foregroundStyle(d.note == "no_evidence" ? .secondary : .primary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(d.justification).font(.callout)
                                        if let q = d.evidence.first { Text("“\(q)”").font(.caption).foregroundStyle(.secondary).italic() }
                                    }
                                }
                            }
                        }
                    }
                    if let s = result.summary { section("Summary") { Text(s) } }
                    section("Resume") { Text(fileText("resume.txt", "resume.md")).font(.callout) }
                    section("Projects") { Text(fileText("projects.txt", "projects.md")).font(.callout) }
                }.padding()
            }
        }.frame(width: 680, height: 620)
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption).foregroundStyle(.secondary)
            content()
        }
    }

    private func folder() -> String { profilesDir + "/" + result.candidateId }
    private func fileText(_ names: String...) -> String {
        for n in names {
            if let t = try? String(contentsOfFile: folder() + "/" + n, encoding: .utf8) { return t }
        }
        return "(not found)"
    }
    private func contact() -> String {
        let parts = [result.email, result.phone].filter { !$0.isEmpty }
        return parts.isEmpty ? result.candidateId : parts.joined(separator: "  ·  ")
    }
}

// MARK: - File pickers

func pickFile(_ done: @escaping (String) -> Void) {
    let p = NSOpenPanel(); p.canChooseFiles = true; p.canChooseDirectories = false
    if p.runModal() == .OK, let u = p.url { done(u.path) }
}
func pickDir(_ done: @escaping (String) -> Void) {
    let p = NSOpenPanel(); p.canChooseFiles = false; p.canChooseDirectories = true
    if p.runModal() == .OK, let u = p.url { done(u.path) }
}

// MARK: - App

@main
struct ScreeningApp: App {
    var body: some Scene {
        WindowGroup("Hiring Assistant") { ContentView() }
            .defaultSize(width: 1040, height: 640)
    }
}
