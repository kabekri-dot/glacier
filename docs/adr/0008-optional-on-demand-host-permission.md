# The "all websites" permission is optional and asked for only when a panel first opens

Settings and the shortcuts panel open **beside** the sidebar, which a browser only allows if Glacier may draw on the web page next to it ("Read and change all your data on all websites"). The browser's warning text can't be changed, but its timing can. So the permission is declared **optional**, not required. Installing Glacier shows no warning, and notes, links and sync work without it. The first time you open settings or the shortcuts panel, Glacier shows its own short explanation card in the sidebar, and the browser's prompt appears only after you click **Allow** on it. Both browsers require such a request to follow a click. If you decline, nothing breaks: both panels open **inside** the sidebar, over the note. You can change this later in settings.

The card states what the permission is used for (drawing those two panels) and what it is never used for (reading, saving or sending anything from the sites you visit). When v2 adds clipping, which needs the same permission, the card gains one line about it and Glacier asks again, rather than claiming that use up front.

## Considered Options

- **Required at install**: one scary, unexplained warning before you've seen the app.
- **Never ask; panels always inside the sidebar**: no warning at all, but you lose the live view of the note while changing settings.

## Addition (2026-10-10): seeing the current page works the same way

To offer "+ Lesson note" for the page you're on and to open a page's Lesson Note, Glacier must read the current tab's address and title. Chrome calls that permission **"tabs"** and describes it as "Read your browsing history". It follows the same rule as above: declared **optional**, never asked at install, requested the first time you click "+ Lesson note", after Glacier's own short explanation. If you decline, Glacier still works: "+ New note" lets you create a Lesson Note by typing its title and picking the Course yourself, just without automatic matching to the page. If the panels permission is granted, it also covers reading the tab, so you're only asked once.
