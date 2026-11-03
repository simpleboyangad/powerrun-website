/* Admin - save invoices as PDF files (Ship karo, GST / CA report).
 *
 * html2pdf (html2canvas + jsPDF) turns the rendered invoice sheet into an A4 PDF in
 * the browser; JSZip packs a month of them for the CA. Both load only when needed. */
(function () {
  'use strict';
  var PRA = (window.PRA = window.PRA || {});

  var LIBS = {
    html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  };
  var loading = {};

  function load(name, ready) {
    if (ready()) return Promise.resolve();
    if (!loading[name]) {
      loading[name] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = LIBS[name];
        s.onload = function () { ready() ? resolve() : reject(new Error(name + ' load nahi hua')); };
        s.onerror = function () { delete loading[name]; reject(new Error('PDF tool load nahi hua - internet check karein.')); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  /* PDF (Blob) of one rendered document element, e.g. .invoice-sheet. A4 width; the
     page is made as tall as the invoice so it is never cut in the middle of a table
     (a slightly long invoice prints fitted on one A4 sheet). */
  PRA.pdfBlob = async function (element) {
    await load('html2pdf', function () { return !!window.html2pdf; });
    var w = element.scrollWidth || 794, h = element.scrollHeight || 1123;
    var pageHeight = Math.max(297, Math.ceil(210 * h / w) + 1);
    return window.html2pdf().set({
      margin: 0,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: [210, pageHeight], orientation: 'portrait' },
      pagebreak: { mode: [] }
    }).from(element).outputPdf('blob');
  };

  PRA.zip = async function () {
    await load('jszip', function () { return !!window.JSZip; });
    return new window.JSZip();
  };

  PRA.saveBlob = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  };

  PRA.base64Blob = function (b64, type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/pdf' });
  };

  /* safe file names: PR/26-27/0001 -> PR-26-27-0001 */
  PRA.fileSafe = function (text) {
    return String(text || '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };
})();
