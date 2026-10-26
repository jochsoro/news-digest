/*
 * SystemTabs — iPhone Duo (écran fermé) : la VRAIE barre d'onglets système,
 * via un UITabBarController UIKit.
 *
 * Sur le Duo fermé, iOS réserve une colonne à droite et y place lui-même la
 * barre d'un UITabBarController. On ne dessine donc rien : tous les onglets
 * vivent dans la barre système, dans l'ordre envoyé par le JS.
 *
 * Le contrôleur est un ENFANT du CAPBridgeViewController, posé par-dessus la
 * webview dans une vue « passe-plat » (PassThroughView) : seuls les touchers
 * sur la barre système sont captés, tout le reste traverse jusqu'à la
 * webview. Les onglets n'ont pas de contenu natif : la navigation reste au
 * routeur Angular (NativeTabsService), notifié via `onSelect`.
 *
 * Repris de l'app Dalà (DalaSystemTabs), éprouvé sur appareil.
 */

import UIKit

final class SystemTabs: UITabBarController, UITabBarControllerDelegate {

    struct Item {
        let id: String
        let title: String
        let image: UIImage
    }

    /// Appelé quand l'utilisateur tape un onglet (jamais lors de select()).
    var onSelect: ((String) -> Void)?

    private var ids: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        delegate = self
        view.backgroundColor = .clear
    }

    /// (Re)construit les onglets — un UIViewController vide et transparent
    /// par onglet, qui ne sert qu'à porter son UITabBarItem.
    func configure(items: [Item], selectedId: String?, tint: UIColor?, style: UIUserInterfaceStyle) {
        if items.map(\.id) != ids || viewControllers == nil {
            ids = items.map(\.id)
            setViewControllers(items.enumerated().map { idx, item in
                let vc = EmptyTabContent()
                vc.tabBarItem = UITabBarItem(title: item.title, image: item.image, tag: idx)
                return vc
            }, animated: false)
        } else {
            for (idx, item) in items.enumerated() {
                viewControllers?[idx].tabBarItem.title = item.title
                viewControllers?[idx].tabBarItem.image = item.image
            }
        }
        if let tint = tint { tabBar.tintColor = tint; view.tintColor = tint }
        overrideUserInterfaceStyle = style
        select(id: selectedId)
    }

    /// Sélection programmatique (route courante) — ne notifie pas le JS.
    func select(id: String?) {
        guard let id = id, let idx = ids.firstIndex(of: id) else { return }
        if selectedIndex != idx { selectedIndex = idx }
    }

    // MARK: UITabBarControllerDelegate

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        guard let idx = viewControllers?.firstIndex(of: viewController), idx < ids.count else { return }
        onSelect?(ids[idx])
    }

    /// Vues de CONTENU des onglets (transparentes) — les touchers dessus
    /// doivent traverser jusqu'à la webview.
    var contentViews: [UIView] { (viewControllers ?? []).compactMap { $0.isViewLoaded ? $0.view : nil } }
}

/// Contenu d'onglet vide et transparent.
private final class EmptyTabContent: UIViewController {
    override func loadView() {
        let v = UIView()
        v.backgroundColor = .clear
        view = v
    }
}

/// Conteneur posé sur la webview : ne garde QUE les touchers destinés à la
/// barre système ; le reste renvoie nil → la webview reçoit.
final class PassThroughView: UIView {
    weak var tabs: SystemTabs?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        if hit === self { return nil }
        guard let tabs = tabs else { return nil }
        if hit === tabs.view { return nil }
        for content in tabs.contentViews {
            if hit.isDescendant(of: content) || content.isDescendant(of: hit) { return nil }
        }
        return hit
    }
}

/// Vue transparente, non interactive, qui relaie `safeAreaInsetsDidChange`
/// ET les changements de taille (pliage du Duo : la FENÊTRE se redimensionne
/// sans forcément toucher aux safe-areas).
final class SafeAreaObserver: UIView {
    var onChange: (() -> Void)?
    private var lastSize: CGSize = .zero

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non supporté") }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        onChange?()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != lastSize {
            lastSize = bounds.size
            onChange?()
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        onChange?()
    }
}
