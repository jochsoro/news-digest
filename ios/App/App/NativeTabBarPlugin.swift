/*
 * NativeTabBar — la VRAIE barre d'onglets iOS pour News Digest.
 *
 * Deux dispositions, même API JS, choisies à chaque configure() selon la
 * présence d'une colonne latérale réservée par le système :
 *
 *   1. iPhone Duo fermé (bande droite ≥ 24 pt) : SystemTabs — un VRAI
 *      UITabBarController système (enfant du bridge VC, dans une vue
 *      passe-plat) : iOS place lui-même sa barre dans la colonne de droite.
 *      La barre vit dans une zone déjà réservée → la webview n'a rien à
 *      réserver : mode "system".
 *
 *   2. iPhone classique : UITabBar posée par-dessus la webview, ancrée en
 *      bas. Sur iOS 26 elle adopte d'elle-même le Liquid Glass. Le CSS
 *      réserve sa hauteur : mode "overlay".
 *
 * Si la colonne apparaît/disparaît (pliage du Duo), la disposition est
 * recalculée automatiquement (observateur de safe-area).
 *
 * Le web garde la main sur le routing :
 *   - JS → natif : configure() (items + thème + tint), select(), setVisible()
 *   - natif → JS : "tabSelected" { id } quand l'utilisateur tape un onglet ;
 *     "layoutChanged" { mode } quand la disposition bascule.
 * La sélection PROGRAMMATIQUE (select()) ne notifie pas le JS.
 *
 * Repris de l'app Dalà (NativeTabBarPlugin), éprouvé sur appareil et Duo.
 * Enregistré dans MainViewController.capacitorDidLoad.
 */

import Capacitor
import UIKit

@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise)
    ]

    private struct ItemSpec {
        let id: String
        let title: String
        let image: UIImage
    }

    private struct Config {
        let specs: [ItemSpec]
        let selectedId: String?
        let tint: UIColor?
        let style: UIUserInterfaceStyle
    }

    private var wantsVisible = false
    private var lastConfig: Config?
    private var selectedId: String?
    private var sideMode = false

    /// Largeur minimale de la bande droite pour considérer qu'on a une
    /// colonne latérale (Duo fermé : ~30–60 pt selon l'exposition).
    private static let sideStripMin: CGFloat = 24

    // ---- Duo : UITabBarController système (colonne de droite) ----
    private var systemTabs: SystemTabs?
    private var systemTabsHost: PassThroughView?
    private var insetsObserver: SafeAreaObserver?

    // ---- iPhone classique : overlay en bas ----
    private var tabBar: UITabBar?
    private var tabIds: [String] = []
    private static let barHeight: CGFloat = 49

    // ================================================================
    // MARK: - Méthodes exposées au JS
    // ================================================================

    @objc func configure(_ call: CAPPluginCall) {
        guard let rawItems = call.getArray("items") else {
            call.reject("Paramètre 'items' manquant")
            return
        }
        let selectedId = call.getString("selectedId")
        let tint = call.getString("tint").flatMap { Self.color(fromHex: $0) }
        let style = Self.interfaceStyle(from: call.getString("theme") ?? "system")

        let specs: [ItemSpec] = rawItems.compactMap { raw in
            guard let dict = raw as? [String: Any],
                  let id = dict["id"] as? String,
                  let title = dict["title"] as? String else { return nil }
            let image = UIImage(systemName: dict["sfSymbol"] as? String ?? "circle.fill")
                ?? UIImage(systemName: dict["fallbackSymbol"] as? String ?? "circle.fill")
                ?? UIImage(systemName: "circle.fill")!
            return ItemSpec(id: id, title: title, image: image)
        }
        guard !specs.isEmpty else {
            call.reject("'items' est vide ou mal formé")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Plugin libéré"); return }
            let config = Config(specs: specs, selectedId: selectedId, tint: tint, style: style)
            self.lastConfig = config
            self.selectedId = selectedId
            self.ensureInsetsObserver()
            self.apply(config)
            call.resolve([
                "mode": self.sideMode ? "system" : "overlay",
                "barHeight": Self.barHeight,
                "sideInset": self.container.map { self.sideInset($0) } ?? 0
            ])
        }
    }

    @objc func select(_ call: CAPPluginCall) {
        let id = call.getString("id")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            self.selectedId = id
            if self.sideMode { self.systemTabs?.select(id: id) } else { self.legacyApplySelection(id) }
            call.resolve()
        }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        let animated = call.getBool("animated") ?? true
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            self.wantsVisible = visible
            if self.sideMode {
                self.sideApplyVisibility(visible, animated: animated)
            } else {
                self.legacyApplyVisibility(visible: visible, animated: animated)
            }
            call.resolve()
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            self.wantsVisible = false
            self.lastConfig = nil
            self.insetsObserver?.removeFromSuperview()
            self.insetsObserver = nil
            self.sideDestroy()
            self.legacyDestroy()
            call.resolve()
        }
    }

    // ================================================================
    // MARK: - Choix de la disposition
    // ================================================================

    private var container: UIView? { bridge?.viewController?.view }

    private func hasSideStrip(_ container: UIView) -> Bool {
        // PORTRAIT uniquement : en paysage, l'encoche des iPhone classiques
        // donne un inset droit de 44–59 pt → faux positif sinon.
        let bounds = container.bounds
        guard bounds.height > bounds.width else { return false }
        // Signal 1 — bande DANS la fenêtre, exposée en safe-area (simulateur).
        if container.safeAreaInsets.right >= Self.sideStripMin { return true }
        // Signal 2 — Duo RÉEL : la bande vit HORS de la fenêtre, plus étroite
        // que l'écran et collée à gauche.
        if let window = container.window {
            let gapRight = window.screen.bounds.width - window.frame.maxX
            if gapRight >= Self.sideStripMin { return true }
        }
        return false
    }

    /// Largeur de la colonne système à droite, en points (0 si absente).
    /// Même logique que hasSideStrip : safe-area OU fenêtre rétrécie.
    private func sideInset(_ container: UIView) -> CGFloat {
        guard hasSideStrip(container) else { return 0 }
        var inset = container.safeAreaInsets.right
        if let window = container.window {
            inset = max(inset, window.screen.bounds.width - window.frame.maxX)
        }
        return inset
    }

    private func apply(_ config: Config) {
        guard let container = container else { return }
        let side = hasSideStrip(container)
        #if DEBUG
        let win = container.window
        NSLog("[NativeTabBar] side=%d insetsR=%d bounds=%dx%d winMaxX=%d screenW=%d",
              side ? 1 : 0,
              Int(container.safeAreaInsets.right),
              Int(container.bounds.width), Int(container.bounds.height),
              Int(win?.frame.maxX ?? -1), Int(win?.screen.bounds.width ?? -1))
        #endif
        if side != sideMode {
            if side { legacyDestroy() } else { sideDestroy() }
        }
        sideMode = side
        if side {
            sideConfigure(config, in: container)
        } else {
            legacyConfigure(specs: config.specs, selectedId: selectedId ?? config.selectedId, tint: config.tint, style: config.style)
        }
    }

    private func ensureInsetsObserver() {
        guard insetsObserver == nil, let container = container else { return }
        let observer = SafeAreaObserver()
        observer.onChange = { [weak self] in
            guard let self = self, let config = self.lastConfig, let container = self.container else { return }
            if self.hasSideStrip(container) != self.sideMode {
                self.apply(config)
                self.notifyListeners("layoutChanged", data: [
                    "mode": self.sideMode ? "system" : "overlay",
                    "sideInset": self.sideInset(container)
                ])
            }
        }
        container.addSubview(observer)
        NSLayoutConstraint.activate([
            observer.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            observer.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            observer.topAnchor.constraint(equalTo: container.topAnchor),
            observer.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        insetsObserver = observer
    }

    // ================================================================
    // MARK: - iPhone Duo : barre dans la colonne système
    // ================================================================

    private func sideConfigure(_ config: Config, in container: UIView) {
        if systemTabs == nil, let parent = bridge?.viewController {
            let host = PassThroughView()
            host.translatesAutoresizingMaskIntoConstraints = false
            host.backgroundColor = .clear
            host.isHidden = true
            host.alpha = 0
            container.addSubview(host)
            NSLayoutConstraint.activate([
                host.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                host.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                host.topAnchor.constraint(equalTo: container.topAnchor),
                host.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])
            let tabs = SystemTabs()
            tabs.onSelect = { [weak self] id in
                self?.selectedId = id
                self?.notifyListeners("tabSelected", data: ["id": id])
            }
            parent.addChild(tabs)
            tabs.view.translatesAutoresizingMaskIntoConstraints = false
            host.addSubview(tabs.view)
            NSLayoutConstraint.activate([
                tabs.view.leadingAnchor.constraint(equalTo: host.leadingAnchor),
                tabs.view.trailingAnchor.constraint(equalTo: host.trailingAnchor),
                tabs.view.topAnchor.constraint(equalTo: host.topAnchor),
                tabs.view.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            ])
            tabs.didMove(toParent: parent)
            host.tabs = tabs
            systemTabs = tabs
            systemTabsHost = host
        }
        systemTabs?.configure(
            items: config.specs.map { .init(id: $0.id, title: $0.title, image: $0.image) },
            selectedId: selectedId ?? config.selectedId,
            tint: config.tint,
            style: config.style
        )
        sideApplyVisibility(wantsVisible, animated: false)
    }

    private func sideApplyVisibility(_ visible: Bool, animated: Bool) {
        guard let host = systemTabsHost else { return }
        if visible {
            host.isHidden = false
            guard animated else { host.alpha = 1; return }
            UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut]) { host.alpha = 1 }
        } else {
            guard animated else { host.alpha = 0; host.isHidden = true; return }
            UIView.animate(withDuration: 0.18, delay: 0, options: [.curveEaseIn]) {
                host.alpha = 0
            } completion: { _ in
                if host.alpha == 0 { host.isHidden = true }
            }
        }
    }

    private func sideDestroy() {
        if let tabs = systemTabs {
            tabs.willMove(toParent: nil)
            tabs.view.removeFromSuperview()
            tabs.removeFromParent()
        }
        systemTabsHost?.removeFromSuperview()
        systemTabs = nil
        systemTabsHost = nil
    }

    // ================================================================
    // MARK: - iPhone classique : UITabBar posée en bas sur la webview
    // ================================================================

    private func legacyConfigure(specs: [ItemSpec], selectedId: String?, tint: UIColor?, style: UIUserInterfaceStyle) {
        guard let container = bridge?.viewController?.view else { return }
        legacyEnsureBar(in: container)
        tabIds = specs.map { $0.id }

        let items = specs.enumerated().map { index, spec in
            UITabBarItem(title: spec.title, image: spec.image, tag: index)
        }
        tabBar?.setItems(items, animated: false)
        legacyApplySelection(selectedId)
        if let tint = tint { tabBar?.tintColor = tint }
        tabBar?.overrideUserInterfaceStyle = style
        legacyApplyVisibility(visible: wantsVisible, animated: false)
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let index = item.tag
        guard index >= 0 && index < tabIds.count else { return }
        notifyListeners("tabSelected", data: ["id": tabIds[index]])
    }

    private func legacyEnsureBar(in container: UIView) {
        guard tabBar == nil else { return }
        let bar = UITabBar()
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.delegate = self
        bar.isHidden = true
        bar.alpha = 0
        container.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            bar.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor, constant: -Self.barHeight)
        ])
        tabBar = bar
    }

    private func legacyApplySelection(_ id: String?) {
        guard let bar = tabBar, let items = bar.items else { return }
        if let id = id, let idx = tabIds.firstIndex(of: id), let match = items.first(where: { $0.tag == idx }) {
            bar.selectedItem = match
        } else {
            bar.selectedItem = nil
        }
    }

    private func legacyApplyVisibility(visible: Bool, animated: Bool) {
        guard let bar = tabBar else { return }
        if visible {
            bar.isHidden = false
            guard animated else { bar.alpha = 1; bar.transform = .identity; return }
            UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut]) {
                bar.alpha = 1
                bar.transform = .identity
            }
        } else {
            guard animated else { bar.alpha = 0; bar.isHidden = true; return }
            UIView.animate(withDuration: 0.18, delay: 0, options: [.curveEaseIn]) {
                bar.alpha = 0
                bar.transform = CGAffineTransform(translationX: 0, y: 12)
            } completion: { _ in
                if bar.alpha == 0 { bar.isHidden = true; bar.transform = .identity }
            }
        }
    }

    private func legacyDestroy() {
        tabBar?.removeFromSuperview()
        tabBar = nil
        tabIds = []
    }

    // ================================================================
    // MARK: - Utilitaires
    // ================================================================

    private static func interfaceStyle(from theme: String) -> UIUserInterfaceStyle {
        switch theme {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    private static func color(fromHex hex: String) -> UIColor? {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        if value.count == 3 { value = value.map { "\($0)\($0)" }.joined() }
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1
        )
    }
}
