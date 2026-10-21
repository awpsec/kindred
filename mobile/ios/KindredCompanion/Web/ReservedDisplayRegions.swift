import SwiftUI

/// Frames are local to the web host, including the system's safety margins.
/// Keep inactive divisions to identify a fold-capable display without model names.
struct ReservedDisplayRegion: Equatable, Encodable {
    let kind: String
    let active: Bool
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

@MainActor
struct ReservedDisplayRegions: ViewModifier {
    let session: WebSession

    func body(content: Content) -> some View {
        if #available(iOS 27.1, *) {
            content.onGeometryChange(for: [ReservedDisplayRegion].self) { proxy in
                let divisions = proxy.reservedRegions(kind: .division, options: .includeInactive, layoutDirectionBehavior: .fixed)
                let occlusions = proxy.reservedRegions(kind: .occlusion, layoutDirectionBehavior: .fixed)
                return divisions.map { region in
                    ReservedDisplayRegion(kind: "division", active: region.isActive,
                        x: Double(region.frame.minX), y: Double(region.frame.minY),
                        width: Double(region.frame.width), height: Double(region.frame.height))
                } + occlusions.map { region in
                    ReservedDisplayRegion(kind: "occlusion", active: region.isActive,
                        x: Double(region.frame.minX), y: Double(region.frame.minY),
                        width: Double(region.frame.width), height: Double(region.frame.height))
                }
            } action: { regions in
                session.updateReservedRegions(regions)
            }
        } else {
            content
        }
    }
}
