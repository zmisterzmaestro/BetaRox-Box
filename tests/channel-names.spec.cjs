const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");

const origin = "http://127.0.0.1:4173";
const editor = origin + "/editor/";
const engine = { URL, document: { title: "" }, navigator: { platform: "Linux", userAgent: "Node" } };
runInNewContext(readFileSync("goldbox/website/beepbox_synth.js", "utf8"), engine);
const { Song, Note } = engine.beepbox;

test.beforeEach(async ({ context }) => {
    // Serve the production page's exact CDN dependencies locally for this test.
    for (const [url, module] of [
        ["https://code.jquery.com/jquery-3.4.1.min.js", "jquery/dist/jquery.min.js"],
        ["https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.7/js/select2.min.js", "select2/dist/js/select2.min.js"],
        ["https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.7/css/select2.min.css", "select2/dist/css/select2.min.css"],
    ]) {
        await context.route(url, route => route.fulfill({ path: require.resolve(module), headers: { "access-control-allow-origin": "*" } }));
    }
});

test("channel names survive editing, reordering, undo, sharing and reopening", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    const song = new Song();
    song.channels[0].patterns[0].notes.push(new Note(36, 0, 24, 3));
    song.referenceA4Hz = 432;
    await page.goto(song.toCompatibleUrl(editor));
    const labels = page.locator(".channelLabels input");
    const menu = value => page.locator("select").filter({ has: page.locator('option[value="' + value + '"]') });
    const lead = "Tenor 🎷 & bass";
    const expectedNames = () => JSON.parse(new URL(page.url()).searchParams.get("bn") || "[]");

    await labels.first().click();
    await expect(labels.first()).toBeFocused();
    await labels.first().fill(lead);
    await labels.first().press("Enter");
    await expect.poll(() => expectedNames()[0]).toBe(lead);
    await labels.first().fill("Discard this");
    await labels.first().press("Escape");
    await expect(labels.first()).toHaveValue(lead);
    await labels.last().fill("Drums");
    await labels.last().press("Tab");
    await expect.poll(() => expectedNames().at(-1)).toBe("Drums");

    await menu("enableChannelMuting").selectOption("enableChannelMuting");
    const firstMuteRow = page.locator(".muteEditor .mute-button").first().locator("..");
    await firstMuteRow.scrollIntoViewIfNeeded();
    const row = await firstMuteRow.boundingBox();
    const middle = row.y + row.height / 2;
    // The transparent channel menu becomes the pointer target when the number is hovered.
    await page.mouse.move(row.x + 5, middle);
    await page.mouse.move(row.x + 26, middle);
    await menu("chnDown").selectOption("chnDown");
    await expect.poll(() => expectedNames()[1]).toBe(lead);
    await expect(labels.first()).toHaveValue("");
    await menu("undo").selectOption("undo");
    await expect(labels.first()).toHaveValue(lead);
    await menu("redo").selectOption("redo");
    await expect(labels.nth(1)).toHaveValue(lead);
    await page.reload();
    await expect(labels.nth(1)).toHaveValue(lead);

    async function copySong(value) {
        await page.evaluate(() => navigator.clipboard.writeText(""));
        await menu(value).selectOption(value);
        const read = () => page.evaluate(() => navigator.clipboard.readText());
        await expect.poll(read).toContain(editor);
        return new URL(await read());
    }
    const named = await copySong("copyUrl");
    const stripped = await copySong("copyUrlWithoutChannelNames");
    expect(named.hash).toBe(stripped.hash);
    expect(stripped.searchParams.has("bn")).toBe(false);
    expect(new Song(named.hash).channels.every(c => c.name === "")).toBe(true);
    const reopened = new Song(Song.songStringFromUrl(named.href));
    expect(reopened.channels[1].name).toBe(lead);
    expect(reopened.channels[1].patterns[0].notes[0].pitches[0]).toBe(36);
    expect(reopened.referenceA4Hz).toBe(432);
    const json = new Song();
    json.fromJsonObject(reopened.toJsonObject());
    expect(json.channels[1].name).toBe(lead);
    await expect(labels.nth(1)).toHaveValue(lead);

    const exploration = page.locator("#betarox-player-link");
    await exploration.focus();
    expect(new URL(await exploration.getAttribute("href")).searchParams.get("bn")).toBe(named.searchParams.get("bn"));
    await page.goto(stripped.href);
    await expect(labels.nth(1)).toHaveValue("");
    await page.goto(named.href);
    await page.setViewportSize({ width: 390, height: 844 });
    await labels.nth(1).scrollIntoViewIfNeeded();
    await expect(labels.nth(1)).toBeInViewport();
    await expect(labels.nth(1)).toHaveValue(lead);
    await labels.nth(1).fill("");
    await labels.nth(1).press("Enter");
    await expect.poll(() => expectedNames()[1]).toBe("");
    await menu("undo").selectOption("undo");
    await expect(labels.nth(1)).toHaveValue(lead);

    await menu("displayBrowserUrl").selectOption("displayBrowserUrl");
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect.poll(() => new URL(page.url()).searchParams.has("bn")).toBe(false);
    const hiddenModeLink = await copySong("copyUrl");
    expect(JSON.parse(hiddenModeLink.searchParams.get("bn"))[1]).toBe(lead);
    await page.reload();
    await expect(labels.nth(1)).toHaveValue(lead);
});

test("loading older songs clears labels from the previous song", () => {
    const song = new Song();
    const emptyNameTag = "U" + "00".repeat(song.getChannelCount());
    const olderPayload = song.toBase64String().replace(emptyNameTag, "");
    song.channels[0].name = "Previous song";
    song.fromBase64String(olderPayload);
    expect(song.channels[0].name).toBe("");
});

test("navigation, channel sidebar and instrument envelope settings", async ({ page }) => {
    const song = new Song();
    const url = song.toCompatibleUrl(editor);
    const labels = page.locator(".channelLabels");
    const pattern = page.locator(".pattern-area");
    const nav = page.getByRole("link", { name: "Open Exploration Lab" });
    await page.goto(url);
    for (const layout of ["small", "long", "tall", "wide", "mobile"]) {
        await page.setViewportSize({ width: layout === "mobile" ? 390 : 1440, height: 900 });
        await page.evaluate(value => localStorage.setItem("layout", value), layout === "mobile" ? "small" : layout);
        await page.reload();
        await expect(labels.locator("input").first()).toBeVisible();
        const side = await labels.boundingBox(), grid = await pattern.boundingBox(), link = await nav.boundingBox();
        expect(side.x + side.width).toBeLessThanOrEqual(grid.x + 1);
        expect(side.y).toBeLessThanOrEqual(grid.y + 1);
        expect(link.y + link.height).toBeLessThanOrEqual(grid.y + 1);
    }
    await page.locator(".envelopePanel summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Note size controls note volume by default.")).toBeVisible();
    await page.getByRole("button", { name: "Add envelope" }).click();
    const shape = page.getByRole("combobox", { name: "Envelope shape 1", exact: true });
    await shape.selectOption({ label: "decay 1" });
    await expect(page.locator(".envelopePanel")).toContainText("Halves every 0.100 s");
    await shape.selectOption({ label: "tremolo4" });
    await expect(page.locator(".envelopePanel")).toContainText("50–100%");
    await expect(page.locator("#about-betarox")).toContainText("Thank you to Slarmoo");
});
