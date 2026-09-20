// test-radiodns-name.cpp — the broadcaster's OWN station name, out of the SI.xml we already fetch.
//
// ★★★ WHY THIS EXISTS. logoFor() fetched SI.xml, parsed past <mediumName>/<shortName>/<longName>
//     and returned only the logo URL. Auto RDS bookmarks then had to reconstruct a name from the
//     PS — which cannot work against a station that MARQUEES it, eight characters at a time
//     (Kiko's server, Umuarama: "UMUARAMA" / "ALINE" / "RADIO" one second apart, PI stable at
//     4322). The broadcaster had already told us what they are called; we threw it away.
//     Stuart: "we already query radiodns for the logos anyway".
//
// ★★ DRIVEN THROUGH setFetcher, SO THERE IS NO NETWORK HERE. A test that reached RadioDNS would
//    be measuring somebody else's DNS on the day it ran. The document is REAL though — Global's
//    Capital Birmingham block, fetched 2026-09-21 — because a hand-written fixture would only
//    prove the parser matches my idea of the format.
//
// ★ The fixture deliberately wraps the service in <serviceProvider> and <serviceGroupMember>:
//   both begin "<service", and a prefix match scopes to the wrong block and returns the PROVIDER
//   ("Global Media & Entertainment") instead of the station ("Capital").

#include "radiodns.h"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

int main() {
    int fails = 0;

    /* ★ run-tests.sh runs from the REPO ROOT, a direct run is usually from vibeserver/. Try both
     *  rather than make the test care which — a fixture that cannot be found reads as a failure of
     *  the thing under test, which is a miserable five minutes. */
    std::ifstream f("vibeserver/testdata-si.xml");
    if (!f) f.open("testdata-si.xml");
    if (!f) { std::printf("FAIL cannot find testdata-si.xml (tried ./ and vibeserver/)\n"); return 1; }
    std::stringstream ss; ss << f.rdbuf();
    const std::string si = ss.str();

    /* Stand in for the whole network: the CNAME, the SRV and the document fetch. Anything that is
     * not the SI document answers empty, exactly as a broadcaster with no SPI would. */
    vsradiodns::setFetcher([&](const std::string& url, const std::string&) -> std::string {
        if (url.find("SI.xml") != std::string::npos) return si;
        if (url.find("type=CNAME") != std::string::npos)
            return R"({"Answer":[{"data":"epg.example.org."}]})";
        if (url.find("type=SRV") != std::string::npos)
            return R"({"Answer":[{"data":"0 0 443 epg.example.org."}]})";
        return {};
    });

    // Capital Birmingham on 102.2 MHz: PI C670, ECC E1 → bearer fm:ce1.c670.10220.
    std::string name;
    const std::string logo = vsradiodns::logoFor("C670", "E1", 102.2e6, &name);

    std::printf("logo: %s\n", logo.empty() ? "(none)" : logo.c_str());
    std::printf("name: %s\n", name.empty() ? "(none)" : name.c_str());

    if (name.empty()) {
        ++fails;
        std::printf("  FAIL ★★★ the name was not returned — this is the whole point of the change\n");
    } else if (name == "Global Media & Entertainment" || name == "Global") {
        ++fails;
        std::printf("  FAIL scoped to <serviceProvider> — the prefix trap, returning the provider\n");
    } else if (name == "Wrong Station" || name == "NotThis") {
        ++fails;
        std::printf("  FAIL scoped to <serviceGroupMember> — the prefix trap\n");
    } else if (name != "Capital") {
        ++fails;
        std::printf("  FAIL expected the mediumName 'Capital', got '%s'\n", name.c_str());
    } else {
        std::printf("  ok   ★★★ the broadcaster's own name, from the document we already fetch\n");
    }

    // ★ The logo must still work — this change must not cost what already worked.
    if (logo.empty()) {
        ++fails; std::printf("  FAIL the logo regressed to empty\n");
    } else std::printf("  ok   the logo still resolves\n");

    // ★★ A bearer nobody published must yield nothing, not a neighbour's name. Same reasoning as
    //    the ECC test's refusals: a confident wrong answer is worse than none.
    std::string absent = "sentinel";
    const std::string none = vsradiodns::logoFor("FFFF", "E1", 99.9e6, &absent);
    if (!none.empty() || !absent.empty()) {
        ++fails;
        std::printf("  FAIL an unknown bearer returned logo='%s' name='%s'\n",
                    none.c_str(), absent.c_str());
    } else std::printf("  ok   an unknown bearer returns nothing at all\n");

    std::printf(fails ? "FAILED %d\n" : "all good\n", fails);
    return fails ? 1 : 0;
}
