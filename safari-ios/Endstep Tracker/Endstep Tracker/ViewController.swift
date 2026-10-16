//
//  ViewController.swift
//  Endstep Tracker
//
//  Created by mickael couzinet on 08/10/2026.
//

import UIKit
import WebKit

// The app only shows how to turn the Safari extension on (Main.html), in French on a French iPhone, in English otherwise.
class ViewController: UIViewController, WKNavigationDelegate {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        // The page's background (--bg), so nothing white shows around it or before it loads.
        let background = UIColor(red: 0.059, green: 0.051, blue: 0.039, alpha: 1)
        self.view.backgroundColor = background
        self.webView.isOpaque = false
        self.webView.backgroundColor = background

        self.webView.navigationDelegate = self

        // The app's own language list may hold English only: ask for the iPhone's.
        if Locale.preferredLanguages.first?.hasPrefix("fr") == true {
            let french = WKUserScript(source: "document.documentElement.classList.add('fr')", injectionTime: .atDocumentStart, forMainFrameOnly: true)
            self.webView.configuration.userContentController.addUserScript(french)
        }

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    // "Open endstep.cc" goes to Safari, where the extension runs, not into this page.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

}
