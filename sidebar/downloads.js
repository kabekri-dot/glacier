// Export and printing (#13, #55, #71). The file formats live in the Notebook
// core; this only hands the browser a file or opens its print window.
// "Download as a file" is in the ⋯ menu and on the ▾ menu's hover icons; the
// rest live in Settings, under Where your notes live (#18, #94). The sidebar always does the
// download, also for settings beside it (#21).
//
// Markdown gives the file or a zip; PDF and Print open the browser's print
// window with the notes laid out on their own, where the user picks Save as
// PDF. Every download first saves the line being edited, so it is in there.
// A locked secret note asks for the passcode first (`unlockFirst(title)`
// resolves to false on Cancel, #109); its Markdown file stays encrypted.
import { printHtml } from "../src/print-layout.mjs";

export function createDownloads({ notebook, screen, notice, unlockFirst }) {
  function download(data, type, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  function printWindow(notes) {
    const win = window.open("", "_blank");
    if (!win) {
      notice("Your browser blocked the print window");
      return;
    }
    win.document.write(printHtml(notes));
    win.document.close();
    win.focus();
    win.print();
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    async downloadNote(title, format) {
      screen.flush();
      if (!(await unlockFirst(title))) return;
      if (format !== "md") return printWindow(notebook.notesToPrint(title));
      // A note with sketches comes as a zip, its svg files next to it (#101).
      if (notebook.hasSketches(title)) {
        download(notebook.exportNoteZip(title), "application/zip", `${title} ${today()}.zip`);
        return;
      }
      const file = notebook.exportNote(title);
      download(file.text, "text/markdown", file.path.split("/").pop());
    },

    // `archived` is for a Collection's Download icon in the Archive section.
    downloadCourse(course, format, { archived = false } = {}) {
      screen.flush();
      if (format !== "md") return printWindow(notebook.notesOfCourse(course, { archived }));
      download(notebook.exportCourseZip(course, { archived }), "application/zip", `${course} ${today()}.zip`);
    },

    exportAll() {
      screen.flush();
      download(notebook.exportZip(), "application/zip", `Glacier notes ${today()}.zip`);
    },

    exportArchive() {
      screen.flush();
      download(notebook.exportArchiveZip(), "application/zip", `Glacier archive ${today()}.zip`);
    },
  };
}
