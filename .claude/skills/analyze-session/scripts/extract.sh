#!/usr/bin/env bash
# Distill a Claude Code session JSONL into a compact, greppable digest.
# The raw session can be many MB — NEVER read it directly into the model.
# Usage: extract.sh <session.jsonl>
#
# Sections printed: metadata, human prompts, tool-usage counts, every vspec
# command in order, vspec subcommand frequency, --format usage, direct edits
# under specs/, error codes + samples, suggested_next_actions count, and the
# assistant's own narration (often the richest signal for where it got stuck).

F="${1:?usage: extract.sh <session.jsonl>}"
[ -f "$F" ] || { echo "No such file: $F" >&2; exit 1; }

# jq helper: tolerate malformed lines, never abort the script.
jqc() { jq -r "$1" "$F" 2>/dev/null; }

# All tool_result text (content may be a string or an array of blocks).
results() {
  jqc 'select(.type=="user") | .message.content
       | if type=="array" then
           (.[] | select(.type=="tool_result")
                | (if (.content|type)=="array"
                     then (.content[] | select(.type=="text") | .text)
                     else (.content|tostring) end))
         else empty end'
}

echo "## Session"
echo "path:  $F"
echo "lines: $(wc -l < "$F" | tr -d ' ')   bytes: $(wc -c < "$F" | tr -d ' ')"
echo "cwd:   $(jqc 'select(.cwd!=null)|.cwd' | sort -u | paste -sd, -)"
echo "branch:$(jqc 'select(.gitBranch!=null)|.gitBranch' | sort -u | paste -sd, -)"
echo

echo "## Human prompts (the task)"
jqc 'select(.type=="user") | .message.content
     | if type=="string" then .
       elif type=="array" then (.[]|select(.type=="text")|.text)
       else empty end' | sed 's/^/- /'
echo

echo "## Tool usage counts"
jqc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' \
  | sort | uniq -c | sort -rn
echo

echo "## vspec commands in order (Bash)"
jqc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use" and .name=="Bash")|.input.command' \
  | grep -nE 'vspec' || echo "(no vspec invocations found)"
echo

echo "## vspec subcommand frequency (excludes help/which)"
jqc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use" and .name=="Bash")|.input.command' \
  | grep -oE 'vspec(-[a-z]+)? [a-z][a-z-]*( [a-z][a-z-]*)?' \
  | grep -vwE 'help|which' | grep -vE -- '--' \
  | sort | uniq -c | sort -rn || echo "(none)"
echo

echo "## --format usage across vspec calls (is the agent envelope being used?)"
jqc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use" and .name=="Bash")|.input.command' \
  | grep -oE -- '--format[= ][a-z]+' | sort | uniq -c || echo "(no explicit --format)"
echo

echo "## Direct edits under specs/ (Edit/Write) — CLI-vs-handauthor signal"
jqc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use" and (.name=="Edit" or .name=="Write"))|.input.file_path' \
  | grep -oE 'specs/[a-z]+/' | sort | uniq -c || echo "(none)"
echo

RES="$(results)"

echo "## Error codes seen in tool results"
printf '%s\n' "$RES" | grep -oE '"code": *"[A-Za-z_]+"' | sort | uniq -c | sort -rn || echo "(none)"
echo

echo "## Error / failure samples (codes, messages, exit lines)"
printf '%s\n' "$RES" \
  | grep -nE '"code"|"message"|INVALID_|NOT_FOUND|VALIDATION_FAILED|Exit code [1-9]|Error:|error:' \
  | head -60 || echo "(none)"
echo

echo "## suggested_next_actions occurrences in results: $(printf '%s\n' "$RES" | grep -c suggested_next_actions)"
echo

echo "## Assistant narration (where it reasoned / got stuck)"
jqc 'select(.type=="assistant")|.message.content[]?|select(.type=="text")|.text' \
  | grep -v '^[[:space:]]*$' | sed 's/^/| /'
