// ★★★ A SECOND CLOSE FOR ONE SESSION MUST NOT INVENT A 0-SECOND "REFUSAL" ROW.
//
// A listener holds several sockets (spectrum, audio, decoder). The log OPENS on the spectrum one
// alone — "logging both would double-count every ordinary browser" — but CLOSED on any of them,
// and an unmatched close fell through to the branch that records a connection refused before it
// was logged. So every ordinary visit was followed by a phantom 0-second entry: connect, bounce
// instantly. That is the exact pattern an owner examines for abuse, and it was our own audio
// socket. Stuart, 2026-08-11, on a Ukrainian address: "is this a bot or spam as it is a very
// distinct connection pattern 0 seconds then 2:50".
//
// ★★ The tests below pin BOTH sides, because the easy fix breaks the other one: a refusal that
//    was never opened must still be recorded, and two session-less refusals from one address are
//    two events (that is what a scan looks like), not one.
#include "vibe_admin.h"
#include <cstdio>
#include <cstdlib>   // mkdtemp
#include <string>
static int fails = 0;
static void ok(bool c, const char* w) {
  std::printf("  %s %s\n", c ? "\033[32mok\033[0m  " : "\033[31mFAIL\033[0m", w); if (!c) fails++;
}
static int rowsFor(const std::string& j, const std::string& sess) {
  int n = 0; size_t p = 0;
  while ((p = j.find("\"session\":\"" + sess + "\"", p)) != std::string::npos) { n++; p++; }
  return n;
}
int main() {
  std::printf("connection log — one connection, one row\n");
  {
    vibeadmin::ConnLog log;
    log.open("1.2.3.4", "sess-A", "Mozilla/5.0", "GB");
    log.close("1.2.3.4", "sess-A", "closed");     // the spectrum socket
    log.close("1.2.3.4", "sess-A", "closed");     // ★ the AUDIO socket, moments later
    log.close("1.2.3.4", "sess-A", "closed");     // ★ and a decoder socket
    const std::string j = log.json();
    ok(rowsFor(j, "sess-A") == 1, "★★★ three closes for one session leave ONE row, not three");
  }
  {
    // A genuine refusal — never opened — must still be recorded, or the log stops showing
    // the very event an owner is looking for.
    vibeadmin::ConnLog log;
    log.close("9.9.9.9", "sess-B", "banned");
    ok(rowsFor(log.json(), "sess-B") == 1, "a refusal that was never opened is still recorded");
  }
  {
    // Two refusals from one address with NO session id are two events (that is a scan).
    vibeadmin::ConnLog log;
    log.close("8.8.8.8", "", "banned");
    log.close("8.8.8.8", "", "banned");
    const std::string j = log.json();
    int n = 0; size_t p = 0;
    while ((p = j.find("\"ip\":\"8.8.8.8\"", p)) != std::string::npos) { n++; p++; }
    ok(n == 2, "★ two session-less refusals from one address stay two rows");
  }
  {
    // Distinct sessions from one address are distinct connections.
    vibeadmin::ConnLog log;
    log.open("5.5.5.5", "s1", "UA", "GB"); log.close("5.5.5.5", "s1", "closed");
    log.open("5.5.5.5", "s2", "UA", "GB"); log.close("5.5.5.5", "s2", "closed");
    ok(rowsFor(log.json(), "s1") == 1 && rowsFor(log.json(), "s2") == 1,
       "two real visits from one address stay two rows");
  }
  {
    /* ★★★ HISTORY MUST SURVIVE. saveIfDue() used to call rewriteLocked(), which writes the
     *  in-memory tail back out "discarding whatever the file held beyond it" — so the file was cut
     *  to 2000 rows every time it passed 4000. MEASURED on the Pi 500: the busiest radio takes 465
     *  connections a day, so that is about FOUR DAYS, not the months Stuart believed he had.
     *  ★★ This test writes enough rows to force a rotation and then asserts the OLD rows are still
     *     on disk, in an archive, rather than gone. It is the assertion the old behaviour fails. */
    char dir[] = "/tmp/vibe-connlog-XXXXXX";
    if (!mkdtemp(dir)) { ok(false, "could not make a temp dir"); }
    else {
      const std::string path = std::string(dir) + "/connections.jsonl";
      {
        vibeadmin::ConnLog log;
        log.setPath(path);
        // ★ ~120 bytes a row here, so 30k did NOT reach the 4 MB threshold — the first run of this test
        //   proved rotation had not fired at all. 60k clears it with room to spare.
        for (int i = 0; i < 60000; ++i) {
          char sess[32]; std::snprintf(sess, sizeof sess, "s%d", i);
          log.open("9.9.9.9", sess, "UA", "GB");
          log.close("9.9.9.9", sess, "closed");
          if ((i % 500) == 0) log.saveIfDue();
        }
        log.saveIfDue();
      }
      // An archive must exist, and it must hold rows the current file no longer does.
      const std::string arch = path + ".1";
      FILE* a = fopen(arch.c_str(), "r");
      ok(a != nullptr, "★★★ the rotated archive exists — history is not discarded");
      long archRows = 0;
      if (a) { char l[1024]; while (fgets(l, sizeof l, a)) ++archRows; fclose(a); }
      ok(archRows > 2000, "the archive holds far more than the 2000-row live view");
      long curRows = 0;
      if (FILE* c = fopen(path.c_str(), "r")) { char l[1024]; while (fgets(l, sizeof l, c)) ++curRows; fclose(c); }
      std::printf("      archive %ld rows, current %ld rows\n", archRows, curRows);
      ok(archRows + curRows > 20000, "★★★ the great majority of the history is still on disk");
      // ★ And a fresh log must still find rows after a rotation — a restart at the wrong moment
      //   must not show an empty page, which reads exactly like "the log was wiped".
      vibeadmin::ConnLog reloaded;
      reloaded.setPath(path);
      ok(reloaded.json().find("9.9.9.9") != std::string::npos,
         "★★ a reload straight after a rotation still shows connections");
    }
  }
  std::printf(fails ? "\n\033[31m%d failed\033[0m\n" : "\n\033[32mpassed\033[0m\n", fails);
  return fails ? 1 : 0;
}
