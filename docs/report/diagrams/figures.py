"""The figures of the Aegis technical documentation. Run: python3.14 figures.py [name ...] (no argument = all).

Each function draws one figure with the helpers in uml.py and writes <slug>.drawio and <slug>.png next to this file.
Names, endpoints, tables and tool tiers are taken from the code (backend/app), so the figures match the build.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
sys.path.insert(0, str(HERE))
from drawio import Diagram, export as export_plain, text_width  # noqa: E402
from uml import AD, CH, FULL_W, GAP, GUARD_GAP, PORT, SD, STEP, FIRST, Canvas  # noqa: E402


# ---------- Figure 2.1: functional modules (Section 2.2) ----------
# Eleven modules, numbered as in Table 2.2. An arrow means that a module uses the results of the module it comes from.
# Every module also writes to the operation log of module 8, and the switches of module 11 can stop modules 6 and 7;
# these connections are described in the text, not drawn.
def block():
    size, h, gap_x, gap_y = 20, 76, 90, 92
    labels = {
        1: "1. Access, Roles &<br>Sessions",
        2: "2. Risk Profiling &<br>Crisis Replay",
        3: "3. Product Shelf &<br>Comparison",
        4: "4. Proposal &<br>Allocation",
        5: "5. Compliance Gate<br>(R-01 to R-09)",
        6: "6. Advisor Agent<br>(Chat & Tools)",
        7: "7. Confirmation &<br>Sandbox Execution",
        8: "8. Advice Records &<br>Operation Log",
        9: "9. Goal Planning &<br>Briefing",
        10: "10. Market Monitoring<br>& Rebalancing",
        11: "11. AI Control Room",
    }
    cols = {"left": [2, 6, 10], "center": [3, 4, 5, 7], "right": [11, 9, 8]}
    row = {1: 0, 2: 1, 3: 1, 11: 1, 6: 2, 4: 2, 9: 2, 10: 3, 5: 3, 8: 3, 7: 4}
    w = max(text_width(t, size, bold=True) for t in labels.values()) + 40
    col_x = {"left": 0, "center": w + gap_x, "right": 2 * (w + gap_x)}
    col_of = {m: c for c, ms in cols.items() for m in ms}
    d = Diagram("Functional Modules of Aegis")
    b = {}
    for m, label in labels.items():
        x = col_x["center"] if m == 1 else col_x[col_of[m]]
        b[m] = d.box(label, round(x), row[m] * (h + gap_y), round(w), h, size=size)
    E = d.edge
    E(b[1], b[2], orthogonal=True, exit=(0, 0.5), entry=(0.5, 0))      # log-in opens the client's workspace
    E(b[1], b[3], exit=(0.5, 1), entry=(0.5, 0))
    E(b[1], b[11], orthogonal=True, exit=(1, 0.5), entry=(0.5, 0))     # the officer's landing page
    E(b[2], b[4], exit=(1, 0.75), entry=(0, 0.25))                      # the risk tier and limits
    E(b[3], b[4], exit=(0.5, 1), entry=(0.5, 0))                        # the eligible products
    E(b[6], b[4], exit=(1, 0.5), entry=(0, 0.5))                        # the agent proposes and revises (T2)
    E(b[4], b[9], exit=(1, 0.5), entry=(0, 0.5))                        # projections of a proposal
    E(b[4], b[5], exit=(0.5, 1), entry=(0.5, 0))                        # every version is checked
    E(b[5], b[7], exit=(0.5, 1), entry=(0.5, 0))                        # only PASS or acknowledged WARNING
    E(b[7], b[8], exit=(1, 0.5), entry=(0.5, 1), orthogonal=True)       # the advice record of each execution
    E(b[7], b[10], exit=(0, 0.5), entry=(0.5, 1), orthogonal=True)      # the executed holdings are monitored
    E(b[10], b[4], exit=(1, 0.25), entry=(0, 0.75))                     # a rebalancing is a new proposal version
    E(b[8], b[11], exit=(1, 0.5), entry=(1, 0.5), orthogonal=True,      # the log feeds the Control Room
      points=[(col_x["right"] + w + 46, 3 * (h + gap_y) + h / 2), (col_x["right"] + w + 46, 1 * (h + gap_y) + h / 2)])
    d.save(HERE / "fig-2-1-modules.drawio")


# ---------- Figure 2.2: components (Section 2.4) ----------
# The subsystem white-box: the Web Application is the only component reachable from outside (port Web UI); the API
# Routers serve it through the /api rewrite. Dependencies point downwards in the order of the layers of Table 2.3.
# The Advisor Agent reaches the Services only through the Permission Broker (Tool Calls), never directly, and only the
# LLM Client reaches the Claude API. The Engines read nothing themselves: the Services pass them the configuration data.
def components():
    c = Canvas("Component Diagram — Aegis Wealth AI")
    FX1, FX2, FY1, FY2 = 90, 1180, 150, 1045
    c.frame("Aegis Wealth AI", FX1, FY1, FX2 - FX1, FY2 - FY1)
    A, B, C, D, E = 215, 385, 565, 745, 925            # top of each row
    web = c.component("web", "Web Application", 330, A, 260)
    api = c.component("api", "API Routers", 330, B, 220)
    agent = c.component("agent", "Advisor Agent", 800, B, 230)
    svc = c.component("svc", "Services", 330, C, 200)
    brk = c.component("brk", "Permission Broker", 700, C, 250)
    grd = c.component("grd", "Grounding Check", 1015, C, 230)
    eng = c.component("eng", "Engines", 330, D, 200)
    llm = c.component("llm", "LLM Client", 1015, D, 230)
    db = c.component("db", "Database", 230, E, 190)
    data = c.component("data", "Data Files", 560, E, 210)

    rest = c.ball("api", "top", 110, "REST API (/api/*)", "right")
    chat = c.ball("agent", "left", 38, "Chat Turn", "aboveleft")
    svci = c.ball("svc", "top", 150, "Service<br>Interfaces", "left")
    tools = c.ball("brk", "top", 150, "Tool Calls", "right")
    chk = c.ball("grd", "top", 60, "Reply Check", "right")
    model = c.ball("llm", "top", 60, "Model Completion", "right")
    engf = c.ball("eng", "top", 100, "Engine Functions", "left")
    sql = c.ball("db", "top", 90, "SQL", "right")
    conf = c.ball("data", "top", 110, "Configuration<br>Data", "right")

    c.use([(rest[0], A + CH), rest], rest)                                      # pages call the API
    c.use([(api["x"] + api["w"], chat[1]), chat], chat)                         # POST /api/chat, /chat/stream
    c.use([(svci[0], B + CH), svci], svci)                                      # every other endpoint
    c.use([(brk["x"] + 15, C), (brk["x"] + 15, svci[1]), svci], svci)           # allowed tool calls only
    c.use([(tools[0], B + CH), tools], tools)
    c.use([(agent["x"] + agent["w"], B + 38), (chk[0], B + 38), chk], chk)
    c.use([(890, B + CH), (890, model[1]), model], model)
    c.use([(engf[0], C + CH), engf], engf)
    c.use([(svc["x"], C + 55), (150, C + 55), (150, sql[1]), sql], sql)
    c.use([(svc["x"] + svc["w"], C + 55), (470, C + 55), (470, conf[1]), conf], conf)

    c.provided_port(web["cx"] - 60, FY1, "top", "Web UI", "left")
    c.delegate([(web["cx"] - 60, FY1 + PORT / 2), (web["cx"] - 60, A)])
    c.required_port(FX2, llm["cy"], "right", "Claude API")
    c.delegate([(llm["x"] + llm["w"], llm["cy"]), (FX2 - PORT / 2, llm["cy"])])
    return c.save("fig-2-2-components", FY2 + 60)


# ---------- Figure 2.3: one advisory run (Section 2.5) ----------
# Scenario 1 from the profile to the advice record, through the REST endpoints of Table 2.7. The API Server stands
# for the routers and services; the Engines are called with every input as an argument. A REJECT ends the run
# ("break"): the client sees the failed rules and How to fix, and no quiz or Confirm is possible.
def advisory_run():
    s = SD(1, "One Advisory Run")
    s.lifeline("c", "Client", 80, actor=True)
    s.lifeline("web", ": Web Application", 440)
    s.lifeline("api", ": API Server", 780)
    s.lifeline("eng", ": Engines", 1010)
    s.lifeline("db", ": Database", 1190)

    s.call("c", "web", "answer questionnaire,<br>react to crisis replay", step=STEP + 14)
    s.call("web", "api", "POST /api/profile")
    s.call("api", "eng", "score(answers)")
    s.reply("eng", "api", "scores, tier")
    s.call("api", "db", "save profile version, log", near="src")
    s.done("db")
    s.reply("api", "web", "profile with risk tier")
    s.reply("web", "c", "risk tier and its reasons")
    s.call("c", "web", "enter amount, horizon,<br>near-term need", step=STEP + 24)
    s.call("web", "api", "POST /api/proposals")
    s.call("api", "eng", "allocate, measure,<br>stress-test, gate", step=STEP + 12)
    s.reply("eng", "api", "items, metrics, gate")
    s.call("api", "db", "save proposal, items, gate result, log", near="src")
    s.done("db")
    s.reply("api", "web", "201 proposal with every rule's result")
    y1 = s.begin()
    s.reply("web", "c", "failed rules, How to fix", step=FIRST, end=False)
    s.y += 20
    s.fragment("break", "[gate decision is REJECT]", 22, 560, y1, s.y)
    s.reply("web", "c", "proposal: PASS or WARNING", step=STEP + 6)
    s.call("c", "web", "answer quiz, click Confirm", step=STEP + 24)
    s.call("web", "api", "POST /api/proposals/{id}/quiz,<br>then /confirm", step=STEP + 12)
    s.call("api", "db", "store token hash, expiry, items hash", near="src")
    s.done("db")
    s.reply("api", "web", "confirm_token (returned once)")
    s.call("web", "api", "POST /api/proposals/{id}/execute<br>with X-Confirm-Token", step=STEP + 30)
    s.call("api", "db", "claim token; orders, positions, cash,<br>advice record in one transaction", near="src",
           step=STEP + 30)
    s.done("db")
    s.reply("api", "web", "orders, cash_after, record_id")
    s.reply("web", "c", "success view and record")
    return s.save("fig-2-3-advisory-run")


# ---------- Figure 4.1: a tool call through the permission broker (Section 4.4) ----------
# Scenario 4: the client asks for a change that breaks the rules. The model can only ask for a tool; the broker
# validates it and checks the tier, the ownership and the switches before any service runs, and a denied call comes
# back to the model as an error. The revision runs through the gate like any other, so the REJECT is visible.
# The reply is shown only after the grounding check; a failure is regenerated once, then replaced by a template.
def tool_call():
    s = SD(2, "A Tool Call Through the Permission Broker")
    s.lifeline("c", "Client", 70, actor=True)
    s.lifeline("agent", ": Advisor Agent", 300)
    s.lifeline("brk", ": Permission Broker", 560)
    s.lifeline("svc", ": Services", 820)
    s.lifeline("grd", ": Grounding Check", 1000)
    s.lifeline("llm", "Claude Model", 1180, actor=True)
    fx1, fx2 = 200, 900

    s.call("c", "agent", "\"make it 80% equity\"", step=STEP + 30)
    s.self_call("agent", "scan threat signals, build masked context")
    s.call("agent", "llm", "messages, 11 tools (no names or e-mails)", step=STEP + 6)
    s.reply("llm", "agent", "tool_use revise_proposal(items)")
    s.call("agent", "brk", "run(revise_proposal, args)")
    s.self_call("brk", "validate schema; check switches,<br>ownership and tier (T2)")
    y1 = s.begin()
    s.call("brk", "svc", "revise(proposal, items)", step=FIRST)
    s.self_call("svc", "run gate R-01 to R-09")
    s.reply("svc", "brk", "REJECT (R-02, R-03)")
    s.reply("brk", "agent", "tool result and REJECT card", end=False)
    yo = s.y
    s.operand("[else]", fx1, fx2)
    s.reply("brk", "agent", "is_error: denied, logged", step=58)
    s.y += 20
    s.fragment("alt", "[call allowed]", fx1, fx2, y1, s.y)
    s.call("agent", "llm", "tool results", step=STEP + 10)
    s.reply("llm", "agent", "reply text (end_turn)")
    s.call("agent", "grd", "check(reply, tool results)")
    s.reply("grd", "agent", "citations, number sources")
    y2 = s.begin()
    s.self_call("agent", "regenerate once, then use a<br>checked template", step=FIRST)
    s.y += 10
    s.fragment("opt", "[a number or phrase fails the check]", fx1, fx2, y2, s.y)
    s.self_call("agent", "log agent_turn with trace and fingerprint", step=STEP + 6)
    s.reply("agent", "c", "reply, cards and AI label")
    return s.save("fig-4-1-tool-call")


# ---------- Figure 2.4: local deployment with Docker Compose (Section 2.6) ----------
# compose.yaml: two containers on the reviewer's computer. The browser reaches the web container on port 3000, which
# forwards /api/* to the api container over the Compose network; port 8000 is also published for the API documentation.
# The api container holds the SQLite database in the named volume api-data. The Claude API is called only when
# ANTHROPIC_API_KEY is set; without it the advisor answers in fallback mode. Open arrowheads point to the side that
# accepts the connection.
def deploy_local():
    c = Canvas("Deployment Diagram 1 — Local Run (Docker Compose)")

    def right(b):
        return b["x"] + b["w"] + b.get("depth", 0)

    c.node("pc", "«device»", "Reviewer's Computer", 20, 70, 850, 690, depth=14, layer="frames")
    br = c.node("br", "«executionEnvironment»", "Web Browser", 44, 170, 280, 124, artifacts=["web front end"])
    c.node("dock", "«executionEnvironment»", "Docker Engine", 400, 140, 440, 600, layer="frames")
    web = c.node("web", "«container»", "web [1]", 440, 230, 370, 124, artifacts=["web image (Next.js, port 3000)"])
    api = c.node("api", "«container»", "api [1]", 440, 470, 370, 196,
                 artifacts=["api image (FastAPI, Uvicorn, 8000)", "volume api-data: aegis.db"])
    cl = c.node("cl", "", "Claude API<br>(Anthropic)", 1060, api["cy"] - 40, 200, 96)

    y = web["y"] + 34
    c.path([(right(br), y), (web["x"], y)], arrow=True)
    c.text("«HTTP»<br>:3000", right(br) + 10, y - 26, 16, align="left")
    c.path([(web["cx"], web["y"] + web["h"]), (web["cx"], api["top"])], arrow=True)
    c.text("«HTTP» /api/* to<br>http://api:8000", web["cx"] + 10, (web["y"] + web["h"] + api["top"]) / 2, 16,
           align="left")
    yd = api["y"] + 40
    c.path([(br["x"] + 60, br["y"] + br["h"]), (br["x"] + 60, yd), (api["x"], yd)], arrow=True)
    c.text("«HTTP» :8000/docs", br["x"] + 70, yd - 16, 16, align="left")
    c.path([(right(api), cl["cy"]), (cl["x"], cl["cy"])], arrow=True)
    c.text("«HTTPS»", 884, cl["cy"] - 16, 16, align="left")
    c.text("only with<br>ANTHROPIC_API_KEY", 884, cl["cy"] + 32, 16, align="left")
    return c.save("fig-2-4-deploy-local", 800)


# ---------- Figure 2.5: hosted deployment on Render (Section 2.6) ----------
# render.yaml and the root Dockerfile: one container on Render's free plan. Render's edge terminates HTTPS and forwards
# to the web server on $PORT; deploy/start.sh starts Uvicorn on 127.0.0.1:8000 first, then the web server, and stops
# both if either exits. Only the web server is reachable; the API is not exposed. Render clones and builds the image
# from GitHub on every push to main. The database is created and seeded at start, so the demo resets with each restart.
def deploy_hosted():
    c = Canvas("Deployment Diagram 2 — Hosted Demo (Render)")

    def right(b):
        return b["x"] + b["w"] + b.get("depth", 0)

    c.node("pc", "«device»", "Visitor's Computer", 20, 100, 270, 200, layer="frames")
    br = c.node("br", "«executionEnvironment»", "Web Browser", 34, 172, 236, 112, artifacts=["web front end"])
    c.node("render", "«device»", "Render Web Service (free, Singapore)", 380, 70, 660, 790, depth=14, layer="frames")
    px = c.node("px", "", "Render Edge<br>(TLS termination)", 410, 150, 300, 90)
    c.node("ct", "«container»", "aegis-wealth-ai [1]", 410, 300, 600, 530, layer="frames")
    nd = c.node("nd", "«executionEnvironment»", "Node.js 22", 440, 390, 300, 124, artifacts=["web (server.js, $PORT)"])
    py = c.node("py", "«executionEnvironment»", "Python 3.12", 440, 620, 300, 162,
                artifacts=["api (Uvicorn, 127.0.0.1:8000)", "aegis.db (seeded at start)"])
    c.artifact(775, 400, 210, "start.sh")
    c.text("starts the API, then the<br>web server; stops both<br>if either exits", 775, 482, 16, align="left")
    gh = c.node("gh", "", "GitHub<br>(main branch)", 1122, 110, 150, 96)
    cl = c.node("cl", "", "Claude API<br>(Anthropic)", 1122, py["cy"] - 40, 150, 96)

    y = px["cy"]
    c.path([(right(br), y), (px["x"], y)], arrow=True)
    c.text("«HTTPS»", 298, y - 16, 16, align="left")
    c.path([(nd["cx"], px["y"] + px["h"]), (nd["cx"], nd["top"])], arrow=True)
    c.text("«HTTP» $PORT (10000)", nd["cx"] + 10, (px["y"] + px["h"] + nd["top"]) / 2 + 20, 16, align="left")
    c.path([(py["cx"], nd["y"] + nd["h"]), (py["cx"], py["top"])], arrow=True)
    c.text("«HTTP» /api/* to 127.0.0.1:8000", py["cx"] + 10, (nd["y"] + nd["h"] + py["top"]) / 2, 16, align="left")
    c.path([(right(py), cl["cy"]), (cl["x"], cl["cy"])], arrow=True)
    c.text("«HTTPS» only with a key", right(py) + 10, cl["cy"] - 16, 16, align="left")
    c.path([(1040, gh["cy"]), (gh["x"], gh["cy"])], arrow=True)
    c.text("«HTTPS»", 1050, gh["cy"] - 16, 16, align="left")
    c.text("cloned and built<br>on push to main", 1112, gh["y"] + gh["h"] + 34, 16, align="left")
    return c.save("fig-2-5-deploy-hosted", 900)


# ---------- Figure 3.1: the compliance gate and the path to execution (Section 3.5) ----------
# Every version, whoever made it (the client, or the agent at T2), is evaluated against all nine rules and saved with
# its result. REJECT stops the path: How to fix is offered, and applying it is a new version that goes round again.
# WARNING needs an acknowledgement of each warning; PASS goes straight on. Only the client's quiz and Confirm lead to a
# token, and execution still checks the token, the items and the compliance switches.
def gate_activity():
    a = AD(1, "The Compliance Gate and the Path to Execution", width=FULL_W)
    cx, lx, rx, lane_r = 470, 150, 860, 1250
    a.initial("start", cx, a.top)
    a.diamond("m_new", cx, below="start")
    a.action("build", "Client or Advisor Agent (T2)", "Create or Revise<br>Proposal", cx, below="m_new")
    a.action("version", "Aegis", "Build Version: Items,<br>Metrics, Stress Tests", cx, below="build")
    a.action("gate", "Aegis", "Evaluate R-01 to R-09<br>(Value Against Limit)", cx, below="version")
    a.action("save", "Aegis", "Save Version, Gate<br>Result and Log", cx, below="gate")
    a.diamond("d_gate", cx, below="save")
    n = a.nodes
    a.action("reject", "Aegis", "Show REJECT and<br>the Failed Rules", rx, n["d_gate"]["cy"])
    a.action("fix", "Aegis", "Compute How to Fix", rx, below="reject")
    a.diamond("d_fix", rx, below="fix")
    a.action("apply", "Client", "Apply Fix as<br>Next Version", rx, below="d_fix", gap=GUARD_GAP)
    a.final("end_rej", rx + 230, n["d_fix"]["cy"])
    a.action("warn", "Client", "Acknowledge Each<br>Warning", cx, below="d_gate", gap=GUARD_GAP)
    a.diamond("m_ok", cx, below="warn")
    a.diamond("m_quiz", cx, below="m_ok")
    a.action("quiz", "Client", "Answer the<br>Comprehension Quiz", cx, below="m_quiz")
    a.diamond("d_quiz", cx, below="quiz")
    a.action("explain", "Aegis", "Explain Each<br>Wrong Answer", lx, n["d_quiz"]["cy"])
    a.action("confirm", "Client", "Click Confirm", cx, below="d_quiz", gap=GUARD_GAP)
    a.action("token", "Aegis", "Issue One-Time Token<br>(Valid 5 Minutes)", cx, below="confirm")
    a.action("check", "Aegis", "Check Token, Items<br>and Switches", cx, below="token")
    a.diamond("d_exec", cx, below="check")
    a.action("refuse", "Aegis", "Refuse and Log", rx, n["d_exec"]["cy"])
    a.final("end_ref", rx, below="refuse")
    a.action("execute", "Aegis", "Place Orders, Write<br>Hash-Chained Record", cx, below="d_exec", gap=GUARD_GAP)
    a.final("end", cx, below="execute")

    for s_, d_ in [("start", "m_new"), ("m_new", "build"), ("build", "version"), ("version", "gate"),
                   ("gate", "save"), ("save", "d_gate"), ("reject", "fix"), ("fix", "d_fix"), ("warn", "m_ok"),
                   ("m_ok", "m_quiz"), ("m_quiz", "quiz"), ("quiz", "d_quiz"), ("confirm", "token"),
                   ("token", "check"), ("check", "d_exec"), ("refuse", "end_ref"), ("execute", "end")]:
        a.flow(s_, d_)
    # REJECT: How to fix, applied as a new version that goes through the gate again
    a.flow("d_gate", "reject", out="right", into="left")
    a.guard("[a hard rule fails]", cx + 26, n["d_gate"]["cy"] - 16)
    a.flow("d_fix", "apply")
    a.guard("[client applies the fix]", rx + 10, n["d_fix"]["cy"] + 44)
    a.flow("d_fix", "end_rej", out="right", into="left")
    a.guard("[else]", rx + 30, n["d_fix"]["cy"] - 16)
    a.flow("apply", "m_new", out="right", into="right",
           via=[(lane_r, n["apply"]["cy"]), (lane_r, n["m_new"]["cy"])])
    # WARNING and PASS
    a.flow("d_gate", "warn")
    a.guard("[a soft rule flags]", cx + 10, n["d_gate"]["cy"] + 44)
    a.flow("d_gate", "m_ok", out="left", into="left",
           via=[(cx - 200, n["d_gate"]["cy"]), (cx - 200, n["m_ok"]["cy"])])
    a.guard("[else: PASS]", cx - 30, n["d_gate"]["cy"] - 16, align="right")
    # the quiz until it is passed
    a.flow("d_quiz", "explain", out="left", into="right")
    a.guard("[else]", cx - 30, n["d_quiz"]["cy"] - 16, align="right")
    a.flow("explain", "m_quiz", out="top", into="left", via=[(lx, n["m_quiz"]["cy"])])
    a.flow("d_quiz", "confirm")
    a.guard("[quiz passed]", cx + 10, n["d_quiz"]["cy"] + 44)
    # execution
    a.flow("d_exec", "refuse", out="right", into="left")
    a.guard("[else]", cx + 30, n["d_exec"]["cy"] - 16)
    a.flow("d_exec", "execute")
    a.guard("[token valid, items unchanged,", cx + 10, n["d_exec"]["cy"] + 34)
    a.guard("execution not halted]", cx + 18, n["d_exec"]["cy"] + 54)
    return a.save("fig-3-1-gate-activity")


# ---------- Figure 3.2: the monitoring loop (Section 3.10) ----------
# Only the officer moves the simulated market. Drift is measured when a screen asks for it, against the latest executed
# proposal, and the whole gate runs on the live weights. Nothing rebalances on its own: the client or the agent (T2)
# proposes, the trades are priced once, and the rebalancing goes through the gate, the quiz and Confirm (Figure 3.1).
# A rebalancing priced before the market moved or the holdings changed is refused as stale.
def monitoring_activity():
    a = AD(2, "The Monitoring Loop", width=FULL_W)
    cx, lx, rx = 500, 150, 900
    a.initial("start", cx, a.top)
    a.action("advance", "Compliance Officer", "Advance the Market<br>(1 to 12 Months, Reason)", cx, below="start")
    a.action("navs", "Aegis", "Replay Monthly Returns,<br>Recompute NAVs, Log", cx, below="advance")
    a.action("open", "Client or Officer", "Open Briefing, Account<br>or Control Room", cx, below="navs")
    a.action("drift", "Aegis", "Measure Drift Against<br>the Executed Mix", cx, below="open")
    a.action("live", "Aegis", "Run the Gate on<br>the Live Weights", cx, below="drift")
    a.diamond("d_status", cx, below="live")
    n = a.nodes
    a.action("breach", "Aegis", "rule_breach:<br>High Alert, Briefing", rx, n["d_status"]["cy"])
    a.final("end_ok", lx, n["d_status"]["cy"])
    a.action("drifted", "Aegis", "drifted:<br>Medium Alert, Briefing", cx, below="d_status", gap=GUARD_GAP + 20)
    a.diamond("m_alert", cx, below="drifted")
    a.diamond("d_prop", cx, below="m_alert")
    a.final("end_wait", lx, n["d_prop"]["cy"])
    a.action("propose", "Client or Advisor Agent (T2)", "Propose Rebalancing", cx, below="d_prop", gap=GUARD_GAP)
    a.action("price", "Aegis", "Price Trades at Today's<br>NAVs: Sells, Then Buys", cx, below="propose")
    a.diamond("d_trade", cx, below="price")
    a.action("nothing", "Aegis", "Refuse: Nothing<br>to Trade", rx, n["d_trade"]["cy"])
    a.final("end_nt", rx, below="nothing")
    a.action("confirm", "Client, Aegis", "Gate, Quiz and Confirm<br>(Figure 3.1)", cx, below="d_trade", gap=GUARD_GAP,
             call=True)
    a.diamond("d_stale", cx, below="confirm")
    a.action("stale", "Aegis", "Refuse as Stale;<br>Client Proposes Again", rx, n["d_stale"]["cy"])
    a.final("end_st", rx, below="stale")
    a.action("exec", "Aegis", "Sell, Then Buy; Write<br>the Advice Record", cx, below="d_stale", gap=GUARD_GAP + 20)
    a.final("end", cx, below="exec")

    for s_, d_ in [("start", "advance"), ("advance", "navs"), ("navs", "open"), ("open", "drift"), ("drift", "live"),
                   ("live", "d_status"), ("drifted", "m_alert"), ("m_alert", "d_prop"), ("propose", "price"),
                   ("price", "d_trade"), ("nothing", "end_nt"), ("confirm", "d_stale"), ("stale", "end_st"),
                   ("exec", "end")]:
        a.flow(s_, d_)
    a.flow("d_status", "breach", out="right", into="left")
    a.guard("[a hard rule fails]", cx + 26, n["d_status"]["cy"] - 16)
    a.flow("breach", "m_alert", out="bottom", into="right", via=[(rx, n["m_alert"]["cy"])])
    a.flow("d_status", "end_ok", out="left", into="right")
    a.guard("[else: on target]", cx - 26, n["d_status"]["cy"] - 16, align="right")
    a.flow("d_status", "drifted")
    a.guard("[a class outside the 5-point", cx + 10, n["d_status"]["cy"] + 36)
    a.guard("band, or a new warning]", cx + 18, n["d_status"]["cy"] + 56)
    a.flow("d_prop", "end_wait", out="left", into="right")
    a.guard("[else: nothing trades]", cx - 26, n["d_prop"]["cy"] - 16, align="right")
    a.flow("d_prop", "propose")
    a.guard("[client or advisor proposes]", cx + 10, n["d_prop"]["cy"] + 44)
    a.flow("d_trade", "nothing", out="right", into="left")
    a.guard("[nothing to trade]", cx + 26, n["d_trade"]["cy"] - 16)
    a.flow("d_trade", "confirm")
    a.guard("[else]", cx + 10, n["d_trade"]["cy"] + 44)
    a.flow("d_stale", "stale", out="right", into="left")
    a.guard("[market moved or", cx + 26, n["d_stale"]["cy"] - 36)
    a.guard("holdings changed]", cx + 34, n["d_stale"]["cy"] - 16)
    a.flow("d_stale", "exec")
    a.guard("[priced at today's market", cx + 10, n["d_stale"]["cy"] + 36)
    a.guard("and holdings]", cx + 18, n["d_stale"]["cy"] + 56)
    return a.save("fig-3-2-monitoring-activity")


# ---------- Figures 2.6 and 2.7: entity-relationship diagrams (Section 2.7) ----------
# The twenty tables of backend/app/models in crow's foot notation (a bar = one, a circle = optional, a crow's foot =
# many), with their primary keys (PK), foreign keys (FK), unique columns and the attributes the text refers to. Two
# diagrams, so that the text stays legible on an A4 page: the client, profile and proposal tables, then execution,
# records and oversight. Entities drawn dashed in the second diagram are detailed in the first. Laid out by hand
# (a Graphviz layout was tried and gave crossing connectors around the busy tables).
ENTITIES = {
    "users": ["id PK", "email UNIQUE", "password_hash", "role"],
    "sessions": ["id PK (hash)", "user_id FK", "expires_at"],
    "profiles": ["id PK", "user_id FK", "version", "tier", "status"],
    "replay_reactions": ["id PK", "profile_id FK", "episode_id", "reaction"],
    "goals": ["id PK", "user_id FK", "target_amount", "horizon_years"],
    "products": ["id PK", "code UNIQUE", "asset_class", "risk_level", "nav"],
    "proposals": ["id PK", "user_id FK", "profile_id FK", "parent_id FK", "version", "status"],
    "proposal_items": ["id PK", "proposal_id FK", "product_id FK", "weight_pct"],
    "gate_results": ["id PK", "proposal_id FK UNIQUE", "decision", "rules"],
    "quiz_attempts": ["id PK", "proposal_id FK", "passed"],
    "confirm_tokens": ["id PK", "proposal_id FK", "token_hash UNIQUE", "expires_at", "used_at"],
    "rebalance_plans": ["id PK", "proposal_id FK UNIQUE", "source_proposal_id FK", "market_month",
                        "holdings_hash"],
    "sandbox_accounts": ["id PK", "user_id FK UNIQUE", "cash"],
    "orders": ["id PK", "account_id FK", "proposal_id FK", "product_id FK", "side", "units"],
    "positions": ["id PK", "account_id FK", "product_id FK", "units"],
    "advice_records": ["id PK", "user_id FK", "proposal_id FK UNIQUE", "prev_hash", "hash"],
    "chat_messages": ["id PK", "user_id FK", "proposal_id FK", "role", "provenance"],
    "operation_logs": ["id PK", "user_id FK", "action", "tier", "decision"],
    "market_clock": ["id PK", "month", "updated_by FK"],
    "controls": ["id PK", "state", "reason", "updated_by FK"],
}
# draw.io crow's foot markers: ERmandOne = exactly one, ERzeroToOne = zero or one, ERoneToMany = one or many,
# ERzeroToMany = zero or many.
ONE, ZERO_ONE, MANY, ZERO_MANY = "ERmandOne", "ERzeroToOne", "ERoneToMany", "ERzeroToMany"
HEAD, ROW = 34, 26


def entity(c, key, name, x, y, w, ref=False):
    """An entity: its name on a grey header, then its key and main attributes; ref=True draws a dashed entity with its
    key only (an entity detailed in the other ER diagram)."""
    from drawio import style as st_
    attrs = ["id PK"] if ref else ENTITIES[name]
    h = HEAD + ROW * len(attrs) + 10
    line = dict(rounded=0, html=1, strokeColor="#000000", strokeWidth=2.5)
    if ref:
        line.update(dashed=1, dashPattern="8 5")
    c._add("shapes", "", x, y, w, h, st_(fillColor="#FFFFFF", **line))
    c._add("shapes", "", x, y, w, HEAD, st_(fillColor="#E7E6E6", **line))
    c._add("labels", name, x, y, w, HEAD, "text;" + st_(html=1, align="center", verticalAlign="middle",
           fontFamily="Helvetica", fontSize=20, fontColor="#000000", fontStyle=1, whiteSpace="nowrap", spacing=0))
    for i, attr in enumerate(attrs):
        c.text(attr, x + 10, y + HEAD + 5 + ROW * (i + 0.5), 18, align="left")
    c.boxes[key] = dict(x=x, y=y, w=w, h=h, cx=x + w / 2, cy=y + h / 2)
    return c.boxes[key]


def rel(c, pts, start, end):
    """Relationship line from the parent (pts[0]) to the child (pts[-1]) with crow's foot markers at both ends."""
    from drawio import style as st_
    cid = c.d._id()
    (x1, y1), (x2, y2), mid = pts[0], pts[-1], pts[1:-1]
    arr = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in mid)
    geo = (f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
           f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/>' + (f'<Array as="points">{arr}</Array>' if mid else "")
           + "</mxGeometry>")
    st = st_(html=1, strokeColor="#000000", strokeWidth=2, rounded=0, edgeStyle="none", startArrow=start,
             endArrow=end, startFill=0, endFill=0, startSize=18, endSize=18)
    c.layers["lines"].append(f'<mxCell id="{cid}" value="" style="{st}" edge="1" parent="1">{geo}</mxCell>')


def er1():
    c = Canvas("ER Diagram 1 — Clients, Profiles and Proposals")
    users = entity(c, "users", "users", 545, 90, 190)
    entity(c, "sessions", "sessions", 40, 320, 190)
    profiles = entity(c, "profiles", "profiles", 300, 320, 190)
    entity(c, "goals", "goals", 1010, 320, 200)
    entity(c, "replay", "replay_reactions", 300, 560, 210)
    prop = entity(c, "proposals", "proposals", 545, 580, 190)
    products = entity(c, "products", "products", 1010, 540, 200)
    entity(c, "gate", "gate_results", 20, 900, 230)
    entity(c, "quiz", "quiz_attempts", 270, 900, 180)
    entity(c, "tokens", "confirm_tokens", 470, 900, 210)
    entity(c, "rebal", "rebalance_plans", 700, 900, 240)
    entity(c, "items", "proposal_items", 1000, 900, 210)
    ux, ub, px, pr, pb = users["x"], users["y"] + users["h"], prop["x"], prop["x"] + prop["w"], prop["y"] + prop["h"]
    rel(c, [(ux, 130), (135, 130), (135, 320)], ONE, ZERO_MANY)                       # sessions
    rel(c, [(ux, 175), (395, 175), (395, 320)], ONE, ZERO_MANY)                       # profiles
    rel(c, [(ux + users["w"], 150), (1110, 150), (1110, 320)], ONE, ZERO_MANY)        # goals
    rel(c, [(680, ub), (680, prop["y"])], ONE, ZERO_MANY)                              # proposals of a user
    rel(c, [(profiles["x"] + profiles["w"], 440), (590, 440), (590, prop["y"])], ONE, ZERO_MANY)
    rel(c, [(395, profiles["y"] + profiles["h"]), (395, 560)], ONE, ZERO_MANY)         # replay reactions
    rel(c, [(pr, 615), (805, 615), (805, 670), (pr, 670)], ZERO_ONE, ZERO_MANY)       # versions: parent_id
    rel(c, [(px, 735), (135, 735), (135, 900)], ONE, ZERO_ONE)                         # gate result
    rel(c, [(px, 762), (360, 762), (360, 900)], ONE, ZERO_MANY)                        # quiz attempts
    rel(c, [(575, pb), (575, 900)], ONE, ZERO_MANY)                                    # confirm tokens
    rel(c, [(715, pb), (715, 900)], ONE, ZERO_ONE)                                     # rebalance plan
    rel(c, [(pr, 752), (1040, 752), (1040, 900)], ONE, MANY)                           # items
    rel(c, [(1150, products["y"] + products["h"]), (1150, 900)], ONE, ZERO_MANY)       # product of an item
    return c.save("fig-2-6-er-proposals", 1110)


def er2():
    c = Canvas("ER Diagram 2 — Execution, Records and Oversight")
    users = entity(c, "users", "users", 780, 90, 200, ref=True)
    entity(c, "sandbox", "sandbox_accounts", 20, 240, 190)
    entity(c, "logs", "operation_logs", 290, 240, 160)
    entity(c, "clock", "market_clock", 990, 240, 140)
    entity(c, "controls", "controls", 1140, 240, 140)
    chat = entity(c, "chat", "chat_messages", 720, 470, 170)
    advice = entity(c, "advice", "advice_records", 950, 470, 215)
    entity(c, "positions", "positions", 20, 740, 160)
    products = entity(c, "products", "products", 270, 779, 130, ref=True)
    orders = entity(c, "orders", "orders", 490, 740, 160)
    prop = entity(c, "proposals", "proposals", 740, 779, 140, ref=True)
    ux, ur, ub = users["x"], users["x"] + users["w"], users["y"] + users["h"]
    rel(c, [(ux, 110), (115, 110), (115, 240)], ONE, ZERO_ONE)                         # sandbox account
    rel(c, [(ux, 135), (370, 135), (370, 240)], ZERO_ONE, ZERO_MANY)                   # operation log
    rel(c, [(ur, 100), (1210, 100), (1210, 240)], ZERO_ONE, ZERO_MANY)                 # controls: updated_by
    rel(c, [(ur, 125), (1060, 125), (1060, 240)], ZERO_ONE, ZERO_MANY)                 # market clock: updated_by
    rel(c, [(800, ub), (800, chat["y"])], ONE, ZERO_MANY)                              # chat messages
    rel(c, [(965, ub), (965, advice["y"])], ONE, ZERO_MANY)                            # advice records
    sb = 240 + HEAD + ROW * 3 + 10
    rel(c, [(100, sb), (100, 740)], ONE, ZERO_MANY)                                    # positions
    rel(c, [(190, sb), (190, 700), (530, 700), (530, 740)], ONE, ZERO_MANY)            # orders
    ry = products["y"] + HEAD + 5 + ROW / 2                                            # the "id PK" row
    rel(c, [(products["x"], ry), (180, ry)], ONE, ZERO_MANY)                           # positions of a product
    rel(c, [(products["x"] + products["w"], ry), (orders["x"], ry)], ONE, ZERO_MANY)   # orders of a product
    rel(c, [(prop["x"], ry), (orders["x"] + orders["w"], ry)], ONE, ZERO_MANY)         # orders of a proposal
    rel(c, [(800, prop["y"]), (800, chat["y"] + chat["h"])], ZERO_ONE, ZERO_MANY)      # chat about a proposal
    rel(c, [(prop["x"] + prop["w"], ry), (1000, ry), (1000, advice["y"] + advice["h"])], ONE, ZERO_ONE)
    return c.save("fig-2-7-er-execution", 990)


FIGURES = {"block": block, "components": components, "advisory_run": advisory_run, "tool_call": tool_call, "er1": er1, "er2": er2,
           "deploy_local": deploy_local, "deploy_hosted": deploy_hosted, "gate_activity": gate_activity,
           "monitoring_activity": monitoring_activity}

if __name__ == "__main__":
    for name in sys.argv[1:] or FIGURES:
        FIGURES[name]()
