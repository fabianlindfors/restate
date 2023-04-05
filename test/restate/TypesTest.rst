model TypesTest {
    prefix "tt"

    field string: String
    field integer: Int
    field decimal: Decimal
    field optional: Optional[Int]
    field boolean: Bool

    // Test comment
    state Created {}

    transition Create: Created {
        field string: String // Test comment on a field
        field integer: Int
        field decimal: Decimal
        field optional: Optional[Int]
        field boolean: Bool
    }
}